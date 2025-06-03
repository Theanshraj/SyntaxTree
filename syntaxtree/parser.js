'use strict';
 
import * as Tokenizer from './tokenizer.js';

export const NodeType = {
  ROOT: 'ROOT',
  NODE: 'NODE',
  VALUE: 'VALUE'
};

export function parse(tokens) {
  const root = {type: NodeType.ROOT, label: '__ROOT__', values: []};
  let node = null;
  let current = 0;
  while (current < tokens.length) {
    [current, node] = parseToken(tokens, current);
    root.values.push(node);
  }
  return root;
}

function parseNode(tokens, current) {
  const node = {
    type: NodeType.NODE,
    label: null,
    subscript: null,
    superscript: null,
    values: [],
    features: [],
    caseFeature: null
  };

  // Get label
  if (current > tokens.length - 2) throw 'Missing label after [';
  const label_token = tokens[++current];
  if (label_token.type !== Tokenizer.TokenType.STRING &&
      label_token.type !== Tokenizer.TokenType.QUOTED_STRING)
    throw 'Expected label string after [';
  node.label = tokens[current++].value;

  // Check for sub/superscript
  if (current < tokens.length - 1 &&
      (tokens[current].type === Tokenizer.TokenType.SUBSCRIPT_PREFIX ||
       tokens[current].type === Tokenizer.TokenType.SUPERSCRIPT_PREFIX)) {
    let is_super = tokens[current].type === Tokenizer.TokenType.SUPERSCRIPT_PREFIX;
    const subscript_token = tokens[++current];
    if (subscript_token.type !== Tokenizer.TokenType.STRING &&
        subscript_token.type !== Tokenizer.TokenType.QUOTED_STRING)
      throw current + ': Expected subscript string after _ or ^';
    if (is_super)
      node.superscript = tokens[current++].value;
    else
      node.subscript = tokens[current++].value;
  }

  // Parse children
  while (current < tokens.length &&
         tokens[current].type !== Tokenizer.TokenType.BRACKET_CLOSE) {
    let value = null;
    [current, value] = parseToken(tokens, current);
    if (value) {
      if (value.type === NodeType.VALUE && /^\+/.test(value.label)) {
        node.features.push(value.label);
      } else if (value.type === NodeType.VALUE && /^\{.*\}$/.test(value.label)) {
        // Case feature: label starts and ends with {}
        // Attach to the previous value node if possible, even if label contains {case} at the end
        if (node.values.length > 0) {
          const prev = node.values[node.values.length - 1];
          if (!prev.caseFeature && prev.type === NodeType.VALUE) {
            // If previous label ends with {case}, split it
            const match = prev.label.match(/^(.*)\s*(\{.*\})$/);
            if (match) {
              prev.label = match[1].trim();
              prev.caseFeature = match[2];
            } else {
              prev.caseFeature = value.label;
            }
          }
        }
        // Do not add this as a value node
      } else {
        // If this value's label ends with {case}, split it
        const match = value.label.match(/^(.*)\s*(\{.*\})$/);
        if (match) {
          value.label = match[1].trim();
          value.caseFeature = match[2];
        }
        node.values.push(value);
      }
    }
  }

  if (current >= tokens.length)
    throw (current - 1) + ': Missing closing bracket ] ...';

  return [current + 1, node];
}

function parseValue(tokens, current) {
  // Assemble multi-string or quoted string label
  let label = null;
  if (tokens[current].type === Tokenizer.TokenType.STRING) {
    const values = [];
    while (current < tokens.length &&
           tokens[current].type === Tokenizer.TokenType.STRING)
      values.push(tokens[current++].value);
    label = values.join(' ');
  } else {
    label = tokens[current++].value;
  }

  // Check for sub/superscript
  let subscript = null;
  let superscript = null;
  if (current < tokens.length - 1 &&
      (tokens[current].type === Tokenizer.TokenType.SUBSCRIPT_PREFIX ||
       tokens[current].type === Tokenizer.TokenType.SUPERSCRIPT_PREFIX)) {
    let is_super = tokens[current].type === Tokenizer.TokenType.SUPERSCRIPT_PREFIX;
    const subscript_token = tokens[++current];
    if (subscript_token.type !== Tokenizer.TokenType.STRING &&
        subscript_token.type !== Tokenizer.TokenType.QUOTED_STRING)
      throw current + ': Expected subscript string after _/^';
    if (is_super)
      superscript = tokens[current++].value;
    else
      subscript = tokens[current++].value;
  }

  // Parse multiple arrows separated by commas
  let arrows = [];
  while (current < tokens.length - 1) {
    // Check for arrow token
    let arrowTypes = [Tokenizer.TokenType.ARROW_TO, Tokenizer.TokenType.ARROW_FROM, Tokenizer.TokenType.ARROW_BOTH, 'ARROW_DOTTED_TO'];
    if (arrowTypes.includes(tokens[current].type)) {
      // Parse one or more arrows separated by commas
      while (arrowTypes.includes(tokens[current].type)) {
        const type = tokens[current].type;
        const ends = {
          to: type === Tokenizer.TokenType.ARROW_TO ||
              type === Tokenizer.TokenType.ARROW_BOTH ||
              type === 'ARROW_DOTTED_TO',
          from: type === Tokenizer.TokenType.ARROW_FROM ||
                type === Tokenizer.TokenType.ARROW_BOTH
        };
        const dotted = type === 'ARROW_DOTTED_TO';

        const target_token = tokens[++current];
        if (target_token.type !== Tokenizer.TokenType.NUMBER)
          throw current + ': Expected column number after arrow';
        const target_value = tokens[current++].value;

        let label_text = null;
        if (current < tokens.length &&
            (tokens[current].type === Tokenizer.TokenType.STRING ||
             tokens[current].type === Tokenizer.TokenType.QUOTED_STRING)) {
          label_text = tokens[current++].value;
        }

        arrows.push({
          ends: ends,
          target: target_value,
          label: label_text,
          dotted: dotted
        });

        // If next token is a comma, skip it and continue parsing more arrows
        if (current < tokens.length && tokens[current].type === Tokenizer.TokenType.STRING && tokens[current].value === ',') {
          current++;
        } else {
          break;
        }
      }
    } else {
      break;
    }
  }

  // Check for case feature in value (for leaf nodes)
  let caseFeature = null;
  if (/^\{.*\}$/.test(label)) {
    caseFeature = label;
  }

  return [
    current,
    {
      type: NodeType.VALUE,
      label: label,
      subscript: subscript,
      superscript: superscript,
      arrows: arrows.length > 0 ? arrows : undefined,
      caseFeature: caseFeature // propagate caseFeature for leaf nodes
    }
  ];
}

function parseToken(tokens, current) {
  switch (tokens[current].type) {
    case Tokenizer.TokenType.BRACKET_OPEN:
      return parseNode(tokens, current);
    case Tokenizer.TokenType.STRING:
    case Tokenizer.TokenType.QUOTED_STRING:
      return parseValue(tokens, current);
    default:
      throw 'Unexpected ' + tokens[current].type + ' at idx ' + current;
  }
}
