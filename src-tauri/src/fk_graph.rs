use crate::scanner::ForeignKeyGraphData;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForeignKeyGraph {
    /// child_table -> vec of parent tables it depends on
    pub dependencies: HashMap<String, Vec<String>>,
    /// parent_table -> vec of child tables that reference it
    pub dependents: HashMap<String, Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CascadeEntry {
    pub table: String,
    pub chain: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FkLockInfo {
    pub table: String,
    pub locked: bool,
    pub locked_by: Vec<String>,
}

impl ForeignKeyGraph {
    pub fn from_scan_data(data: &ForeignKeyGraphData) -> Self {
        Self {
            dependencies: data.dependencies.clone(),
            dependents: data.dependents.clone(),
        }
    }

    /// Returns all tables that must be fully included (all rows)
    /// given the set of user-checked tables.
    pub fn required_full_tables(&self, checked: &HashSet<String>) -> HashMap<String, Vec<String>> {
        let mut required: HashMap<String, Vec<String>> = HashMap::new();

        for table in checked {
            let ancestors = self.get_all_ancestors(table);
            for ancestor in ancestors {
                if !checked.contains(&ancestor) || required.contains_key(&ancestor) {
                    required
                        .entry(ancestor)
                        .or_default()
                        .push(table.clone());
                }
            }
        }

        required
    }

    /// Get all ancestor tables (transitive dependencies) for a given table.
    fn get_all_ancestors(&self, table: &str) -> HashSet<String> {
        let mut ancestors = HashSet::new();
        let mut queue = VecDeque::new();

        if let Some(deps) = self.dependencies.get(table) {
            for dep in deps {
                queue.push_back(dep.clone());
            }
        }

        while let Some(current) = queue.pop_front() {
            if ancestors.insert(current.clone()) {
                if let Some(deps) = self.dependencies.get(&current) {
                    for dep in deps {
                        if !ancestors.contains(dep) {
                            queue.push_back(dep.clone());
                        }
                    }
                }
            }
        }

        ancestors
    }

    /// Given a locked table the user wants to uncheck, compute which checked tables
    /// must also be unchecked (cascade). Returns a list of CascadeEntry items — each
    /// is a checked table that would lose FK coverage, along with the dependency chain
    /// explaining why (e.g. OrderItems → Orders → Customers).
    pub fn compute_cascade_uncheck(
        &self,
        target_table: &str,
        checked: &HashSet<String>,
    ) -> Vec<CascadeEntry> {
        // Find all checked tables that transitively depend on the target table.
        // A checked table must be unchecked if removing the target breaks its FK chain.
        let mut to_uncheck: Vec<CascadeEntry> = Vec::new();

        for table in checked {
            let ancestors = self.get_all_ancestors(table);
            if ancestors.contains(target_table) {
                // Build the dependency chain from this table to the target
                let chain = self.build_dependency_chain(table, target_table);
                to_uncheck.push(CascadeEntry {
                    table: table.clone(),
                    chain,
                });
            }
        }

        to_uncheck.sort_by(|a, b| a.table.cmp(&b.table));
        to_uncheck
    }

    /// Build the shortest dependency chain from `from` to `to`.
    /// Returns e.g. ["OrderItems", "Orders", "Customers"] showing the FK path.
    fn build_dependency_chain(&self, from: &str, to: &str) -> Vec<String> {
        // BFS to find shortest path through the dependency graph
        let mut queue: VecDeque<Vec<String>> = VecDeque::new();
        let mut visited = HashSet::new();

        queue.push_back(vec![from.to_string()]);
        visited.insert(from.to_string());

        while let Some(path) = queue.pop_front() {
            let current = path.last().unwrap();
            if current == to {
                return path;
            }
            if let Some(deps) = self.dependencies.get(current) {
                for dep in deps {
                    if visited.insert(dep.clone()) {
                        let mut new_path = path.clone();
                        new_path.push(dep.clone());
                        queue.push_back(new_path);
                    }
                }
            }
        }

        // Fallback: shouldn't happen if `to` is actually an ancestor of `from`
        vec![from.to_string(), to.to_string()]
    }

    /// Compute FK lock status for all tables given checked set.
    pub fn compute_locks(&self, checked: &HashSet<String>) -> Vec<FkLockInfo> {
        let required = self.required_full_tables(checked);
        let all_tables: HashSet<&String> = self
            .dependencies
            .keys()
            .chain(self.dependents.keys())
            .collect();

        let mut locks = Vec::new();
        for table in all_tables {
            if let Some(locked_by) = required.get(table) {
                locks.push(FkLockInfo {
                    table: table.clone(),
                    locked: true,
                    locked_by: locked_by.clone(),
                });
            }
        }

        locks
    }
}
