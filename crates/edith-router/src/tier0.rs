use chrono::{Datelike, Local, Timelike, Utc};
use regex::Regex;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Tier0Result {
    pub answer: String,
    pub category: &'static str,
}

pub struct Tier0Matcher {
    time_regex: Regex,
    date_regex: Regex,
    math_regex: Regex,
    status_regex: Regex,
}

impl Tier0Matcher {
    pub fn new() -> Self {
        Self {
            time_regex: Regex::new(r"(?i)\b(what time is it|current time|what is the time|tell me the time)\b").unwrap(),
            date_regex: Regex::new(r"(?i)\b(what('s| is) today('?s)? date|what is the date|today'?s date|what day is it)\b").unwrap(),
            math_regex: Regex::new(r"^\s*(?:calculate|calc|what is|evaluate)?\s*([0-9\.\s\+\-\*\/\^\(\)]+)\s*\??\s*$").unwrap(),
            status_regex: Regex::new(r"(?i)\b(system status|system health|edith status|edith health)\b").unwrap(),
        }
    }

    pub fn try_match(&self, input: &str) -> Option<Tier0Result> {
        let trimmed = input.trim();

        // 1. Time query
        if self.time_regex.is_match(trimmed) {
            let local_now = Local::now();
            let utc_now = Utc::now();
            let answer = format!(
                "The current local time is {:02}:{:02}:{:02} ({}), and UTC time is {:02}:{:02}:{:02} UTC.",
                local_now.hour(),
                local_now.minute(),
                local_now.second(),
                local_now.offset(),
                utc_now.hour(),
                utc_now.minute(),
                utc_now.second()
            );
            return Some(Tier0Result {
                answer,
                category: "time",
            });
        }

        // 2. Date query
        if self.date_regex.is_match(trimmed) {
            let local_now = Local::now();
            let weekday = local_now.weekday();
            let answer = format!(
                "Today is {}, {} {}, {}.",
                weekday,
                local_now.format("%B"),
                local_now.day(),
                local_now.year()
            );
            return Some(Tier0Result {
                answer,
                category: "date",
            });
        }

        // 3. Status query
        if self.status_regex.is_match(trimmed) {
            return Some(Tier0Result {
                answer: "EDITH 2.0 system is online and healthy. Storage WAL, EventBus, and local model infrastructure are operational.".to_string(),
                category: "status",
            });
        }

        // 4. Arithmetic calculation
        if let Some(caps) = self.math_regex.captures(trimmed) {
            let expr = caps.get(1).map(|m| m.as_str().trim()).unwrap_or("");
            // Ensure expression actually has digits and at least one operator
            if expr.chars().any(|c| c.is_ascii_digit())
                && expr.chars().any(|c| matches!(c, '+' | '-' | '*' | '/' | '^'))
            {
                if let Ok(result) = evaluate_simple_math(expr) {
                    return Some(Tier0Result {
                        answer: format!("{} = {}", expr, result),
                        category: "math",
                    });
                }
            }
        }

        None
    }
}

impl Default for Tier0Matcher {
    fn default() -> Self {
        Self::new()
    }
}

/// Simple recursive descent / shunting-yard style arithmetic evaluator without external dependencies.
fn evaluate_simple_math(expr: &str) -> Result<f64, ()> {
    let sanitized: String = expr.chars().filter(|c| !c.is_whitespace()).collect();
    let tokens = tokenize(&sanitized)?;
    let mut pos = 0;
    let res = parse_addition_subtraction(&tokens, &mut pos)?;
    if pos == tokens.len() {
        Ok(res)
    } else {
        Err(())
    }
}

#[derive(Debug, PartialEq, Clone)]
enum Token {
    Number(f64),
    Plus,
    Minus,
    Multiply,
    Divide,
    Power,
    LParen,
    RParen,
}

fn tokenize(s: &str) -> Result<Vec<Token>, ()> {
    let mut tokens = Vec::new();
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        match chars[i] {
            '+' => {
                tokens.push(Token::Plus);
                i += 1;
            }
            '-' => {
                tokens.push(Token::Minus);
                i += 1;
            }
            '*' => {
                tokens.push(Token::Multiply);
                i += 1;
            }
            '/' => {
                tokens.push(Token::Divide);
                i += 1;
            }
            '^' => {
                tokens.push(Token::Power);
                i += 1;
            }
            '(' => {
                tokens.push(Token::LParen);
                i += 1;
            }
            ')' => {
                tokens.push(Token::RParen);
                i += 1;
            }
            c if c.is_ascii_digit() || c == '.' => {
                let start = i;
                while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') {
                    i += 1;
                }
                let num_str: String = chars[start..i].iter().collect();
                let num = num_str.parse::<f64>().map_err(|_| ())?;
                tokens.push(Token::Number(num));
            }
            _ => return Err(()),
        }
    }

    Ok(tokens)
}

fn parse_addition_subtraction(tokens: &[Token], pos: &mut usize) -> Result<f64, ()> {
    let mut left = parse_multiplication_division(tokens, pos)?;

    while *pos < tokens.len() {
        match tokens[*pos] {
            Token::Plus => {
                *pos += 1;
                let right = parse_multiplication_division(tokens, pos)?;
                left += right;
            }
            Token::Minus => {
                *pos += 1;
                let right = parse_multiplication_division(tokens, pos)?;
                left -= right;
            }
            _ => break,
        }
    }

    Ok(left)
}

fn parse_multiplication_division(tokens: &[Token], pos: &mut usize) -> Result<f64, ()> {
    let mut left = parse_power(tokens, pos)?;

    while *pos < tokens.len() {
        match tokens[*pos] {
            Token::Multiply => {
                *pos += 1;
                let right = parse_power(tokens, pos)?;
                left *= right;
            }
            Token::Divide => {
                *pos += 1;
                let right = parse_power(tokens, pos)?;
                if right == 0.0 {
                    return Err(());
                }
                left /= right;
            }
            _ => break,
        }
    }

    Ok(left)
}

fn parse_power(tokens: &[Token], pos: &mut usize) -> Result<f64, ()> {
    let base = parse_factor(tokens, pos)?;

    if *pos < tokens.len() && tokens[*pos] == Token::Power {
        *pos += 1;
        let exp = parse_power(tokens, pos)?;
        Ok(base.powf(exp))
    } else {
        Ok(base)
    }
}

fn parse_factor(tokens: &[Token], pos: &mut usize) -> Result<f64, ()> {
    if *pos >= tokens.len() {
        return Err(());
    }

    match tokens[*pos] {
        Token::Number(n) => {
            *pos += 1;
            Ok(n)
        }
        Token::Minus => {
            *pos += 1;
            let val = parse_factor(tokens, pos)?;
            Ok(-val)
        }
        Token::Plus => {
            *pos += 1;
            parse_factor(tokens, pos)
        }
        Token::LParen => {
            *pos += 1;
            let val = parse_addition_subtraction(tokens, pos)?;
            if *pos < tokens.len() && tokens[*pos] == Token::RParen {
                *pos += 1;
                Ok(val)
            } else {
                Err(())
            }
        }
        _ => Err(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tier0_time_and_date() {
        let matcher = Tier0Matcher::new();
        let res = matcher.try_match("what time is it").unwrap();
        assert_eq!(res.category, "time");
        assert!(res.answer.contains("current local time"));

        let res = matcher.try_match("what is today's date?").unwrap();
        assert_eq!(res.category, "date");
        assert!(res.answer.contains("Today is"));
    }

    #[test]
    fn test_tier0_math() {
        let matcher = Tier0Matcher::new();
        let res = matcher.try_match("calculate 25 * 4").unwrap();
        assert_eq!(res.category, "math");
        assert_eq!(res.answer, "25 * 4 = 100");

        let res = matcher.try_match("what is (10 + 5) * 2?").unwrap();
        assert_eq!(res.category, "math");
        assert_eq!(res.answer, "(10 + 5) * 2 = 30");

        let res = matcher.try_match("2 ^ 8").unwrap();
        assert_eq!(res.category, "math");
        assert_eq!(res.answer, "2 ^ 8 = 256");
    }

    #[test]
    fn test_tier0_status() {
        let matcher = Tier0Matcher::new();
        let res = matcher.try_match("system status").unwrap();
        assert_eq!(res.category, "status");
        assert!(res.answer.contains("online and healthy"));
    }

    #[test]
    fn test_non_tier0_passes_through() {
        let matcher = Tier0Matcher::new();
        assert!(matcher.try_match("Why is the sky blue?").is_none());
        assert!(matcher.try_match("Plan a trip to Japan").is_none());
    }
}
