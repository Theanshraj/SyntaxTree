'use strict';

// Token types for the syntax tree parser
export const TokenType = {
  BRACKET_OPEN: 'BRACKET_OPEN',           // [
  BRACKET_CLOSE: 'BRACKET_CLOSE',         // ]
  STRING: 'STRING',                       // Unquoted string
  NUMBER: 'NUMBER',                       // Number
  QUOTED_STRING: 'QUOTED_STRING',         // "..."
  SUBSCRIPT_PREFIX: 'SUBSCRIPT_PREFIX',   // _
  SUPERSCRIPT_PREFIX: 'SUPERSCRIPT_PREFIX', // ^
  ARROW_TO: 'ARROW_TO',                   // ->
  ARROW_FROM: 'ARROW_FROM',               // <-
  ARROW_BOTH: 'ARROW_BOTH'                // <>
};

// Token class represents a single token with type and value
export class Token {
  constructor(type, value = null) {
    this.type = type;
    this.value = value;
  }
}
 
// Main function to tokenize an input string into an array of Token objects
export function tokenize(input) {
  // List of parser functions to try in order
  const parsers = [
    skipWhitespace,         // Skip whitespace
    parseControlCharacters, // Parse brackets, sub/superscript, etc.
    parseArrows,            // Parse arrow tokens
    parseNumber,            // Parse numbers
    parseString,            // Parse unquoted strings
    parseQuotedString       // Parse quoted strings
  ];

  const tokens = [];
  let offset = 0;

  // Main loop: try each parser in order until one matches, then advance
  while (offset < input.length) {
    const now_serving = offset;

    for (const parse_fn of parsers) {
      const [token, consumed] = parse_fn(input.substring(offset));
      offset += consumed;
      if (token != null) tokens.push(token);
      if (offset >= input.length) break;
    }

    // If no parser consumed input, throw an error
    if (offset === now_serving)
      throw 'Unable to parse [' + input.substring(offset) + '] ...';
  }

  return tokens;
}

// Helper: check if character is whitespace
function isWhitespace(ch) {
  const whitespace = [' ', '\b', '\f', '\n', '\r', '\t', '\v'];
  return whitespace.includes(ch);
}

// Helper: check if character is a control character (brackets, quotes, etc.)
function isControlCharacter(ch) {
  const control_chars = ['[', ']', '^', '_', '"'];
  return control_chars.includes(ch);
}

// Helper: check if character is a digit
function isNumber(ch) {
  return ch >= '0' && ch <= '9';
}

// Parser: skip whitespace, return how many chars were skipped
function skipWhitespace(input) {
  let consumed = 0;
  while (isWhitespace(input.charAt(consumed))) ++consumed;
  return [null, consumed];
}

// Parser: parse control characters ([, ], ^, _, etc.)
function parseControlCharacters(input) {
  if (input.charAt(0) === '_') return [new Token(TokenType.SUBSCRIPT_PREFIX), 1];
  if (input.charAt(0) === '^') return [new Token(TokenType.SUPERSCRIPT_PREFIX), 1];
  if (input.charAt(0) === '[') return [new Token(TokenType.BRACKET_OPEN), 1];
  if (input.charAt(0) === ']') return [new Token(TokenType.BRACKET_CLOSE), 1];
  return [null, 0];
}

// Parser: parse arrow tokens (->, <-, <>, .>)
function parseArrows(input) {
  if (input.length > 1) {
    if (input.startsWith('->')) return [new Token(TokenType.ARROW_TO), 2];
    if (input.startsWith('<-')) return [new Token(TokenType.ARROW_FROM), 2];
    if (input.startsWith('<>')) return [new Token(TokenType.ARROW_BOTH), 2];
    if (input.startsWith('.>')) return [new Token('ARROW_DOTTED_TO'), 2]; // Dotted arrow (special)
  }
  return [null, 0];
}

// Parser: parse a number token
function parseNumber(input) {
  let consumed = 0;
  while (consumed < input.length && isNumber(input.charAt(consumed)))
    ++consumed;
  if (consumed > 0) {
    return [
      new Token(TokenType.NUMBER, parseInt(input.substring(0, consumed))),
      consumed
    ];
  } else {
    return [null, 0];
  }
}

// Parser: parse an unquoted string (until whitespace or control char)
function parseString(input) {
  let consumed = 0;
  while (consumed < input.length &&
         !isWhitespace(input.charAt(consumed)) &&
         !isControlCharacter(input.charAt(consumed))) {
    ++consumed;
  }
  if (consumed > 0) {
    return [
      new Token(TokenType.STRING, input.substring(0, consumed)),
      consumed
    ];
  } else {
    return [null, 0];
  }
}

// Parser: parse a quoted string ("...")
function parseQuotedString(input) {
  if (input.charAt(0) !== '"') return [null, 0];
  let consumed = 1;
  while (consumed < input.length && input.charAt(consumed) !== '"') ++consumed;
  if (input.charAt(consumed) !== '"')
    throw 'Unterminated quoted string. Missing " after [' + input + ']';
  return [
    new Token(TokenType.QUOTED_STRING, input.substring(1, consumed)),
    consumed + 1
  ];
}
