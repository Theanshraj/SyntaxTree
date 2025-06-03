// Main entry point for the SyntaxTree web app
// Handles UI setup, event registration, and tree rendering

'use strict';

const VERSION = 'v1.2';

// Import main tree drawing logic and helpers
import Tree from './tree.js';
import rotateTip from './tip.js';
import * as Parser from './parser.js';
import * as Tokenizer from './tokenizer.js';
import { htmlColorNames } from './htmlColors.js';

// Create a new Tree instance (handles drawing and state)
const tree = new Tree();

// On window load, initialize the app
window.onload = () => {
  registerServiceWorker(); // Register service worker for offline support

  e('version').innerHTML = VERSION; // Show version in footer
  tree.setCanvas(e('canvas'));      // Set up drawing canvas
  registerCallbacks();              // Register UI event handlers

  // Populate the arrow color dropdown with all HTML color names
  const arrowColorSelect = e('arrowcolor');
  // Only include high-contrast, non-yellow, non-white, non-light colors
  const excludedColors = [
    'Yellow', 'White', 'LightYellow', 'LemonChiffon', 'Beige', 'Ivory', 'FloralWhite', 'Cornsilk',
    'LightGoldenRodYellow', 'LightGray', 'LightGrey', 'LightCyan', 'LightBlue', 'AliceBlue',
    'HoneyDew', 'MintCream', 'GhostWhite', 'Azure', 'Snow', 'OldLace', 'Seashell', 'LavenderBlush',
    'MistyRose', 'PapayaWhip', 'BlanchedAlmond', 'AntiqueWhite', 'Wheat', 'WhiteSmoke', 'Gainsboro',
    'PeachPuff', 'PowderBlue', 'LightPink', 'LightGreen', 'LightSalmon', 'LightSeaGreen', 'LightSkyBlue',
    'LightSlateGray', 'LightSlateGrey', 'LightSteelBlue', 'Khaki', 'PaleGoldenRod', 'PaleGreen',
    'PaleTurquoise', 'PaleVioletRed', 'LawnGreen', 'Linen', 'LemonChiffon', 'Lavender', 'Thistle',
    'YellowGreen', 'SpringGreen', 'MediumSpringGreen', 'MediumAquaMarine', 'Aquamarine', 'Chartreuse',
    'MediumTurquoise', 'Turquoise', 'Aquamarine', 'MediumSeaGreen', 'MediumSlateBlue', 'SkyBlue',
    'SteelBlue', 'DodgerBlue', 'DeepSkyBlue', 'CornflowerBlue', 'RoyalBlue', 'SlateBlue', 'SlateGray',
    'SlateGrey', 'MediumPurple', 'BlueViolet', 'Indigo', 'DarkGray', 'DarkGrey', 'Silver', 'Tomato',
    'Salmon', 'SandyBrown', 'Peru', 'BurlyWood', 'Tan', 'RosyBrown', 'Moccasin', 'NavajoWhite',
    'Bisque', 'Chocolate', 'Sienna', 'Brown', 'Maroon', 'DarkRed', 'FireBrick', 'IndianRed', 'Crimson',
    'Orchid', 'Plum', 'Violet', 'Magenta', 'Fuchsia', 'DarkMagenta', 'Purple', 'RebeccaPurple',
    'MediumOrchid', 'MediumVioletRed', 'PaleVioletRed', 'DeepPink', 'HotPink', 'Pink', 'LightCoral',
    'Coral', 'DarkOrange', 'Orange', 'Gold', 'GoldenRod', 'DarkGoldenRod', 'SaddleBrown', 'Chocolate',
    'Peru', 'Sienna', 'Brown', 'Maroon', 'Black' // Black is kept for contrast, but you can remove if needed
  ];
  htmlColorNames.filter(color => !excludedColors.includes(color)).forEach(color => {
    const option = document.createElement('option');
    option.value = color;
    option.textContent = color;
    option.style.backgroundColor = color;
    arrowColorSelect.appendChild(option);
  });
  arrowColorSelect.value = 'Purple'; // Set default arrow color
  tree.setArrowColor('Purple');
  arrowColorSelect.onchange = () => {
    tree.setArrowColor(arrowColorSelect.value); // Update arrow color on change
    update();
  };

  // Reset cache button logic
  const resetBtn = document.getElementById('reset-cache');
  if (resetBtn) {
    resetBtn.onclick = async () => {
      // Delete all caches
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
      }
      // Clear all localStorage and sessionStorage
      if ('localStorage' in window) localStorage.clear();
      if ('sessionStorage' in window) sessionStorage.clear();
      // Unregister all service workers
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(reg => reg.unregister()));
      }
      // Reload the page (hard refresh)
      window.location.reload(true);
    };
  }

  // If a phrase is provided in the URL, use it
  const query = decodeURI(window.location.search).replace('?', '');
  if (query != null && query.length > 2) e('code').value = query;

  update(); // Draw initial tree

  rotateTip(); // Show a tip
  setInterval(rotateTip, 30 * 1000); // Rotate tips every 30 seconds
};

// Helper to get element by id
function e(id) {
  return document.getElementById(id);
}

// Register service worker for offline/PWA support
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('syntaxtree_worker.js').then(
      (registration) => { console.info('Service worker registered.'); },
      (error) => { console.warn('Unable to register service worker.'); }
    );
  } else {
    console.info('Service workers not supported.');
  }
}

// Register all UI event handlers for controls
function registerCallbacks() {
  e('code').oninput = update; // Redraw tree on input

  e('font').onchange = () => {
    tree.setFont(e('font').value);
    update();
  };

  e('fontsize').onchange = () => {
    tree.setFontsize(e('fontsize').value);
    update();
  };

  e('triangles').onchange = () => {
    tree.setTriangles(e('triangles').checked);
    update();
  };

  e('nodecolor').onchange = () => {
    tree.setColor(e('nodecolor').checked);
    update();
  };

  e('autosub').onchange = () => {
    tree.setSubscript(e('autosub').checked);
    update();
  };

  e('align').onchange = () => {
    tree.setAlignment(parseInt(e('align').value, 10));
    update();
  };

  e('spacing').oninput = () => {
    tree.setSpacing(parseFloat(e('spacing').value / 100));
    update();
  };

  e('canvas').onclick = () => tree.download(); // Download image on click
}

// Main update function: parses input and redraws the tree
function update() {
  const phrase = e('code').value;
  e('parse-error').innerHTML = '';

  try {
    const tokens = Tokenizer.tokenize(phrase); // Tokenize input
    validateTokens(tokens);                   // Validate bracket structure

    const syntax_tree = Parser.parse(tokens); // Parse tokens into tree
    tree.draw(syntax_tree);                   // Draw the tree
  } catch (err) {
    e('parse-error').innerHTML = err;         // Show error if parsing fails
  }
}
 
// Checks for basic bracket errors in the token list
function validateTokens(tokens) {
  if (tokens.length < 3) throw 'Phrase too short';
  if (tokens[0].type != Tokenizer.TokenType.BRACKET_OPEN ||
      tokens[tokens.length - 1].type != Tokenizer.TokenType.BRACKET_CLOSE)
    throw 'Phrase must start with [ and end with ]';
  const brackets = countOpenBrackets(tokens);
  if (brackets > 0) throw brackets + ' bracket(s) open [';
  if (brackets < 0) throw Math.abs(brackets) + ' too many closed bracket(s) ]';
  return null;
}

// Counts the number of open brackets (should be zero if balanced)
function countOpenBrackets(tokens) {
  let o = 0;
  for (const token of tokens) {
    if (token.type == Tokenizer.TokenType.BRACKET_OPEN) ++o;
    if (token.type == Tokenizer.TokenType.BRACKET_CLOSE) --o;
  }
  return o;
}
