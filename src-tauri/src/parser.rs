/// mysqldump line classification and parsing utilities.

#[derive(Debug, Clone, PartialEq)]
pub enum LineType {
    CreateTable(String),      // Table name
    InsertInto(String),       // Table name
    DropTable(String),        // Table name
    LockTables(String),       // Table name
    UnlockTables,
    CreateTableEnd,           // Closing ");" of a CREATE TABLE block
    ForeignKey(ForeignKeyDef),
    Other,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ForeignKeyDef {
    pub column: String,
    pub references_table: String,
    pub references_column: String,
}

/// Extract a backtick-quoted identifier from a string starting at position `pos`.
/// Returns (identifier, position_after_closing_backtick).
fn extract_backtick_ident(s: &str, start: usize) -> Option<(String, usize)> {
    let bytes = s.as_bytes();
    if start >= bytes.len() || bytes[start] != b'`' {
        return None;
    }
    let name_start = start + 1;
    let mut i = name_start;
    while i < bytes.len() {
        if bytes[i] == b'`' {
            return Some((s[name_start..i].to_string(), i + 1));
        }
        i += 1;
    }
    None
}

/// Classify a line from a mysqldump file.
pub fn classify_line(line: &str) -> LineType {
    let trimmed = line.trim_start();

    if trimmed.starts_with("CREATE TABLE ") {
        if let Some(pos) = trimmed.find('`') {
            if let Some((name, _)) = extract_backtick_ident(trimmed, pos) {
                return LineType::CreateTable(name);
            }
        }
        return LineType::Other;
    }

    if trimmed.starts_with("INSERT INTO ") {
        if let Some(pos) = trimmed.find('`') {
            if let Some((name, _)) = extract_backtick_ident(trimmed, pos) {
                return LineType::InsertInto(name);
            }
        }
        return LineType::Other;
    }

    if trimmed.starts_with("DROP TABLE IF EXISTS ") {
        if let Some(pos) = trimmed.find('`') {
            if let Some((name, _)) = extract_backtick_ident(trimmed, pos) {
                return LineType::DropTable(name);
            }
        }
        return LineType::Other;
    }

    if trimmed.starts_with("LOCK TABLES ") {
        if let Some(pos) = trimmed.find('`') {
            if let Some((name, _)) = extract_backtick_ident(trimmed, pos) {
                return LineType::LockTables(name);
            }
        }
        return LineType::Other;
    }

    if trimmed.starts_with("UNLOCK TABLES") {
        return LineType::UnlockTables;
    }

    // Detect closing of CREATE TABLE block
    if trimmed.starts_with(")") && trimmed.contains(';') {
        return LineType::CreateTableEnd;
    }

    // Foreign key constraint inside CREATE TABLE
    if trimmed.contains("FOREIGN KEY") && trimmed.contains("REFERENCES") {
        if let Some(fk) = parse_foreign_key(trimmed) {
            return LineType::ForeignKey(fk);
        }
    }

    // Also match CONSTRAINT ... FOREIGN KEY ... REFERENCES
    if trimmed.contains("CONSTRAINT") && trimmed.contains("FOREIGN KEY") {
        if let Some(fk) = parse_foreign_key(trimmed) {
            return LineType::ForeignKey(fk);
        }
    }

    LineType::Other
}

/// Parse a FOREIGN KEY constraint line.
/// Expected format: CONSTRAINT `name` FOREIGN KEY (`col`) REFERENCES `table` (`col`)
fn parse_foreign_key(line: &str) -> Option<ForeignKeyDef> {
    // Find FOREIGN KEY (`column`)
    let fk_pos = line.find("FOREIGN KEY")?;
    let after_fk = &line[fk_pos + 11..]; // len("FOREIGN KEY") = 11
    let fk_col_start = after_fk.find('`')?;
    let (column, _) = extract_backtick_ident(after_fk, fk_col_start)?;

    // Find REFERENCES `table` (`column`)
    let ref_pos = line.find("REFERENCES")?;
    let after_ref = &line[ref_pos + 10..]; // len("REFERENCES") = 10
    let ref_table_start = after_ref.find('`')?;
    let (references_table, after_table) = extract_backtick_ident(after_ref, ref_table_start)?;

    let remaining = &after_ref[after_table..];
    let ref_col_start = remaining.find('`')?;
    let (references_column, _) = extract_backtick_ident(remaining, ref_col_start)?;

    Some(ForeignKeyDef {
        column,
        references_table,
        references_column,
    })
}

/// Parse individual tuples from an INSERT VALUES clause.
/// Given: "INSERT INTO `table` VALUES (1,'a'),(2,'b');"
/// Returns the individual tuple strings: ["(1,'a')", "(2,'b')"]
pub fn parse_tuples(values_str: &str) -> Vec<String> {
    let mut tuples = Vec::new();
    let bytes = values_str.as_bytes();
    let len = bytes.len();

    let mut i = 0;
    let mut depth: i32 = 0;
    let mut in_string = false;
    let mut escape_next = false;
    let mut tuple_start: Option<usize> = None;

    while i < len {
        let b = bytes[i];

        if escape_next {
            escape_next = false;
            i += 1;
            continue;
        }

        if in_string {
            match b {
                b'\\' => {
                    escape_next = true;
                }
                b'\'' => {
                    // Check for '' (escaped quote)
                    if i + 1 < len && bytes[i + 1] == b'\'' {
                        i += 2;
                        continue;
                    }
                    in_string = false;
                }
                _ => {}
            }
            i += 1;
            continue;
        }

        match b {
            b'\'' => {
                in_string = true;
            }
            b'(' => {
                if depth == 0 {
                    tuple_start = Some(i);
                }
                depth += 1;
            }
            b')' => {
                depth -= 1;
                if depth == 0 {
                    if let Some(start) = tuple_start {
                        tuples.push(values_str[start..=i].to_string());
                    }
                    tuple_start = None;
                }
            }
            _ => {}
        }
        i += 1;
    }

    tuples
}

/// Extract the VALUES portion from an INSERT statement line.
/// "INSERT INTO `table` VALUES (...);" -> "(...)"
pub fn extract_values_portion(line: &str) -> Option<&str> {
    let idx = line.find(" VALUES ")?;
    Some(&line[idx + 8..]) // len(" VALUES ") = 8
}

/// Extract the INSERT prefix: "INSERT INTO `table` VALUES "
pub fn extract_insert_prefix(line: &str) -> Option<&str> {
    let idx = line.find(" VALUES ")?;
    Some(&line[..idx + 8])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_create_table() {
        let line = "CREATE TABLE `users` (";
        assert_eq!(classify_line(line), LineType::CreateTable("users".into()));
    }

    #[test]
    fn test_classify_insert_into() {
        let line = "INSERT INTO `users` VALUES (1,'Alice'),(2,'Bob');";
        assert_eq!(classify_line(line), LineType::InsertInto("users".into()));
    }

    #[test]
    fn test_classify_unlock() {
        assert_eq!(classify_line("UNLOCK TABLES;"), LineType::UnlockTables);
    }

    #[test]
    fn test_parse_foreign_key() {
        let line = "  CONSTRAINT `fk_orders_users` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),";
        if let LineType::ForeignKey(fk) = classify_line(line) {
            assert_eq!(fk.column, "user_id");
            assert_eq!(fk.references_table, "users");
            assert_eq!(fk.references_column, "id");
        } else {
            panic!("Expected ForeignKey");
        }
    }

    #[test]
    fn test_parse_tuples_simple() {
        let tuples = parse_tuples("(1,'a'),(2,'b');");
        assert_eq!(tuples.len(), 2);
        assert_eq!(tuples[0], "(1,'a')");
        assert_eq!(tuples[1], "(2,'b')");
    }

    #[test]
    fn test_parse_tuples_with_escaped_quotes() {
        let tuples = parse_tuples("(1,'it\\'s'),(2,'ok');");
        assert_eq!(tuples.len(), 2);
    }

    #[test]
    fn test_parse_tuples_with_nested_parens_in_strings() {
        let tuples = parse_tuples("(1,'(hello)'),(2,'world');");
        assert_eq!(tuples.len(), 2);
        assert_eq!(tuples[0], "(1,'(hello)')");
    }
}
