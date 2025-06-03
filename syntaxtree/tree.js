
// This file contains the main Tree class responsible for rendering syntax trees
// on a canvas, as well as helper classes and functions for drawing nodes, arrows,
// and handling tree layout.

'use strict';

const NODE_PADDING = 20; // Padding around node labels

import Canvas from './canvas.js';
import * as Parser from './parser.js';

// Main class for drawing and managing a syntax tree
export default class Tree {
  constructor(canvas) {
    this.nodecolor = true;   // Whether to use colored nodes
    this.fontsize = 16;      // Font size for labels
    this.triangles = true;   // Whether to draw triangles for multi-word leaves
    this.subscript = true;   // Whether to auto-subscript duplicate labels
    this.alignment = 0;      // Tree alignment mode
    this.canvas = null;      // Canvas instance
    this.vscaler = 1;        // Vertical scaling factor
  }

  // Resize the canvas to fit the tree
  resizeCanvas(w, h) {
    this.canvas.resize(w, h+50);
    this.canvas.translate(0, canvas.fontsize / 2);
  }
 
  // Draw the syntax tree from a parsed tree object
  draw(syntax_tree) {
    if (this.canvas == null) throw 'Canvas must be set first.';

    const drawables = drawableFromNode(this.canvas, syntax_tree);
    const max_depth = getMaxDepth(drawables);
    if (this.alignment > 0) moveLeafsToBottom(drawables, max_depth);
    if (this.alignment > 1) moveParentsDown(drawables);
    if (this.subscript) calculateAutoSubscript(drawables);

    const has_arrow = calculateDrawablePositions(this.canvas, drawables, this.vscaler);
    const arrowSet = makeArrowSet(drawables, this.fontsize);
    const arrowScaler = Math.pow((Math.sqrt(arrowSet.maxBottom) / arrowSet.maxBottom), 1 / 50);

    this.resizeCanvas(
      drawables.width + 1,
      Math.max((max_depth + 1) * (this.fontsize * this.vscaler * 3),
               has_arrow ? arrowSet.maxBottom * arrowScaler : 0)
    );

    drawables.children.forEach(child => this.drawNode(child));
    this.drawArrows(arrowSet.arrows);
  }

  // Recursively draw a node and its children
  drawNode(drawable) {
    this.drawLabel(drawable);
    this.drawSubscript(drawable);
    drawable.children.forEach(child => {
      this.drawNode(child);
      this.drawConnector(drawable, child);
    });
  }

  // Draw the label and features for a node
  drawLabel(drawable) {
    this.canvas.setFontSize(this.fontsize); // Set font size for label
    // Choose color: red for leaf, blue for non-leaf, black if color disabled
    const color = this.nodecolor ? (drawable.is_leaf ? '#CC0000' : '#0000CC') : 'black';
    this.canvas.setFillStyle(color);
    // Support multi-line labels (split on \n)
    const labelLines = String(drawable.label).split(/\\n|\n/);
    const lineHeight = this.fontsize * 1.1;
    const centerX = getDrawableCenter(drawable);
    let baseY = drawable.top + 2;
    labelLines.forEach((line, i) => {
      this.canvas.text(line, centerX, baseY + i * lineHeight);
    });
    // Draw case feature below the label if present, but only for leaf nodes
    let labelBlockHeight = labelLines.length * lineHeight;
    if (drawable.is_leaf && drawable.caseFeature) {
      let caseText = '[' + drawable.caseFeature.slice(1, -1) + ']';
      if (caseText.length > 100) {
        caseText = caseText.slice(0, 100) + '…]'; // Truncate long case features
      }
      this.canvas.setFontSize(this.fontsize * 0.7); // Smaller font for case
      this.canvas.setFillStyle('#0000CC'); // Blue for case feature
      this.canvas.text(caseText, centerX, baseY + labelBlockHeight);
      this.canvas.setFontSize(this.fontsize); // Restore font size
      this.canvas.setFillStyle(color); // Restore color
      labelBlockHeight += this.fontsize * 0.7;
    }
    // Draw features below the case feature (if present) or label
    let yOffset = labelBlockHeight;
    if (drawable.features && drawable.features.length > 0) {
      const featText = '[' + drawable.features.join(', ') + ']';
      this.canvas.setFontSize(this.fontsize * 0.65); // Smaller font for features
      this.canvas.text(featText, centerX, baseY + yOffset);
      // Draw arrows from features if they have ->N or .>N after them
      drawable.features.forEach((feat, i) => {
        // Check for arrow syntax in feature: e.g. +PAST->1 or +PAST.>2
        const arrowMatch = feat.match(/^(\+[^\s]+)(?:\s*(->|\.>)(\d+))?$/);
        if (arrowMatch && arrowMatch[2] && arrowMatch[3]) {
          // Draw an arrow from this feature to the Nth leaf
          const arrowType = arrowMatch[2];
          const targetIdx = parseInt(arrowMatch[3], 10);
          // Calculate feature position
          const featureX = centerX - this.canvas.textWidth(featText)/2 + this.canvas.textWidth('[' + drawable.features.slice(0, i).join(', ') + (i > 0 ? ', ' : '') + ']') + this.canvas.textWidth(arrowMatch[1])/2;
          const featureY = baseY + yOffset;
          // Draw a small arrow from the feature to the target leaf
          // Find the target leaf node
          const root = this.rootDrawable || drawable; // fallback if not set
          const target = findTarget(root, targetIdx);
          if (target) {
            // Draw a curve or straight line
            const toX = getDrawableCenter(target);
            const toY = target.top;
            this.canvas.setStrokeStyle('#008080');
            this.canvas.setLineWidth(1.5);
            this.canvas.curve(featureX, featureY, toX, toY, featureX, featureY + 30, toX, toY - 30);
            // Draw arrowhead
            this.drawArrowHead(toX, toY);
          }
        }
      });
      this.canvas.setFontSize(this.fontsize); // Restore font size
    }
  }

  // Draw subscript or superscript for a node label
  drawSubscript(drawable) {
    if (!drawable.subscript && !drawable.superscript) return;
    // Offset to the right of the label
    let offset = 1 + getDrawableCenter(drawable) + this.canvas.textWidth(drawable.label) / 2;
    this.canvas.setFontSize(this.fontsize * 3 / 4); // Smaller font for sub/superscript
    if (drawable.subscript) {
      offset += this.canvas.textWidth(drawable.subscript) / 2;
      this.canvas.text(drawable.subscript, offset, drawable.top + this.fontsize / 2);
    } else {
      offset += this.canvas.textWidth(drawable.superscript) / 2;
      this.canvas.text(drawable.superscript, offset, drawable.top);
    }
    this.canvas.setFontSize(this.fontsize); // Restore font size
  }

  // Draw a connector (line or triangle) between parent and child
  drawConnector(parent, child) {
    // If triangles enabled and child is a leaf with spaces, draw triangle
    if (this.triangles && child.is_leaf && child.label.includes(' ')) {
      // Only use the width of the first line before the first \n for triangle sizing
      const firstLine = String(child.label).split(/\\n|\n/)[0];
      const text_width = this.canvas.textWidth(firstLine);
      this.canvas.triangle(
        getDrawableCenter(parent), parent.top + this.fontsize + 2,
        getDrawableCenter(child) + (text_width / 2) - 4, child.top - 3,
        getDrawableCenter(child) - (text_width / 2) + 4, child.top - 3
      );
    } else {
      // Otherwise, draw a straight line
      this.canvas.line(
        getDrawableCenter(parent), parent.top + this.fontsize + 2,
        getDrawableCenter(child), child.top - 3
      );
    }
  }

  // Draw all arrows (movement, dependencies, etc.)
  drawArrows(arrows) {
    // Color palette for arrows/labels (high-contrast, no yellow/white/light colors)
    const arrowPalette = [
      '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6',
      '#bcf60c', '#008080', '#e6beff', '#9a6324', '#800000', '#808000', '#000075', '#808080', '#000000'
    ];
    // Track label bounding boxes to avoid overlap
    const labelRects = [];
    const labelPadding = 4;
    const labelYOffset = this.fontsize * 0.8; // How much to shift if overlap

    // Helper to check if a point is inside a rectangle
    function pointInRect(x, y, rect) {
      return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
    }

    arrows.forEach((arrow, idx) => {
      // If nodecolor is off, use the dropdown/default color for all arrows
      let pairColor;
      if (!this.nodecolor) {
        pairColor = this.arrowColor || '#909';
      } else {
        pairColor = arrowPalette[idx % arrowPalette.length];
      }
      this.canvas.setFillStyle(pairColor);
      this.canvas.setStrokeStyle(pairColor);
      this.canvas.setLineWidth(2);

      // Dotted arrow support
      if (arrow.dotted) this.canvas.context.setLineDash([4, 2]);
      else this.canvas.context.setLineDash([]);

      // Draw the curve (Bezier)
      this.canvas.curve(arrow.from_x, arrow.from_y, arrow.to_x, arrow.to_y,
                        arrow.from_x, arrow.bottom, arrow.to_x, arrow.bottom);

      if (arrow.ends_to) this.drawArrowHead(arrow.to_x, arrow.to_y);
      if (arrow.ends_from) this.drawArrowHead(arrow.from_x, arrow.from_y);

      // Draw label if present, at the true midpoint of the Bezier curve
      if (arrow.label) {
        // Cubic Bezier midpoint at t=0.5
        function bezier(t, p0, p1, p2, p3) {
          const mt = 1 - t;
          return mt*mt*mt*p0 + 3*mt*mt*t*p2 + 3*mt*t*t*p3 + t*t*t*p1;
        }
        // For y, p2 and p3 are the control points (arrow.from_x, arrow.bottom), (arrow.to_x, arrow.bottom)
        const t = 0.5;
        const mx = bezier(t, arrow.from_x, arrow.to_x, arrow.from_x, arrow.to_x);
        let my = bezier(t, arrow.from_y, arrow.to_y, arrow.bottom, arrow.bottom);
        this.canvas.setFontSize(this.fontsize * 0.75); // Smaller font for arrow label
        const labelWidth = this.canvas.textWidth(arrow.label);
        const labelHeight = this.fontsize * 0.75;
        // Check for overlap and adjust y position if needed
        let tries = 0;
        let maxTries = 15;
        let rect = { x: mx - labelWidth / 2, y: my, width: labelWidth, height: labelHeight };
        // Helper: check if label overlaps any previous label
        function overlapsAnyLabel(r) {
          return labelRects.some(lr => !(r.x + r.width + labelPadding < lr.x || r.x > lr.x + lr.width + labelPadding || r.y + r.height + labelPadding < lr.y || r.y > lr.y + lr.height + labelPadding));
        }
        // Helper: check if label overlaps the curve (by checking if the curve passes through the label's bounding box)
        function overlapsCurve(r) {
          // Sample points along the curve and see if any are inside the label rect
          for (let tt = 0.0; tt <= 1.0; tt += 0.05) {
            const cx = bezier(tt, arrow.from_x, arrow.to_x, arrow.from_x, arrow.to_x);
            const cy = bezier(tt, arrow.from_y, arrow.to_y, arrow.bottom, arrow.bottom);
            if (pointInRect(cx, cy, r)) return true;
          }
          return false;
        }
        while ((overlapsAnyLabel(rect) || overlapsCurve(rect)) && tries < maxTries) {
          my += labelYOffset;
          rect.y = my;
          tries++;
        }
        // Use the same color for the label as the arrow
        this.canvas.setFillStyle(pairColor);
        this.canvas.text(arrow.label, mx, my);
        labelRects.push({ x: mx - labelWidth / 2, y: my, width: labelWidth, height: labelHeight });
        this.canvas.setFontSize(this.fontsize); // Restore font size
      }

      this.canvas.context.setLineDash([]); // Reset line dash
    });
  }

  // Draw an arrowhead at (x, y)
  drawArrowHead(x, y) {
    const cx = this.fontsize / 4;
    const cy = this.fontsize / 2;
    this.canvas.triangle(x, y, x - cx, y + cy, x + cx, y + cy, true);
  }

  // Setters for various options
  setCanvas(c) { this.canvas = new Canvas(c); }
  setColor(e) { this.nodecolor = e; }
  setFont(f) { this.canvas.setFont(f); }
  setFontsize(s) {
    this.fontsize = parseInt(s, 10);
    this.canvas.setFontSize(this.fontsize);
  }
  setTriangles(t) { this.triangles = t; }
  setSubscript(s) { this.subscript = s; }
  setAlignment(a) { this.alignment = a; }
  setSpacing(s) { this.vscaler = s; }
  setArrowColor(color) { this.arrowColor = color; } // Set custom arrow color
  download() { this.canvas.download('syntax_tree.png'); }
}

// Arrow class represents a single arrow (movement, dependency, etc.)
class Arrow {
  constructor(from_x, from_y, to_x, to_y, bottom, ends_to, ends_from, label, dotted) {
    this.from_x = from_x;
    this.from_y = from_y;
    this.to_x = to_x;
    this.to_y = to_y;
    this.bottom = bottom;
    this.ends_to = ends_to;
    this.ends_from = ends_from;
    this.label = label || null;
    this.dotted = dotted || false;
  }
}

// ArrowSet class holds all arrows for a tree and tracks the max vertical position
class ArrowSet {
  constructor() {
    this.arrows = [];
    this.maxBottom = 0;
  }

  add(arrow) {
    this.arrows.push(arrow);
    this.maxBottom = Math.max(this.maxBottom, arrow.bottom);
  }

  concatenate(arrowSet) {
    this.arrows = this.arrows.concat(arrowSet.arrows);
    this.maxBottom = Math.max(this.maxBottom, arrowSet.maxBottom);
  }
}

// Recursively convert a parsed node into a drawable object for rendering
function drawableFromNode(canvas, node, depth = -1, forceLeaf = false) {
  const isLeaf = forceLeaf ? (node.type !== Parser.NodeType.ROOT && node.type !== Parser.NodeType.NODE) : (node.type === Parser.NodeType.VALUE);
  let caseFeature = null;
  let drawableLabel = null;
  // Only assign caseFeature for leaf nodes if present and label is not just the case feature itself
  if (isLeaf && node.caseFeature && node.label && !/^.*$/.test(node.label)) {
    caseFeature = node.caseFeature;
    // Remove the {case} from the label if it is at the end 
    drawableLabel = node.label.replace(/\s*\{.*\}$/, '').trim();
  } else {
    drawableLabel = node.label;
  }
  // Support multiple arrows per node
  // If node.arrows is an array, use it directly. If node.arrow exists (legacy), wrap it in an array.
  let arrows = [];
  if (Array.isArray(node.arrows)) {
    arrows = node.arrows;
  } else if (node.arrow) {
    // Legacy support: convert single arrow to array
    arrows = [node.arrow];
  }
  const drawable = {
    label: drawableLabel,
    subscript: node.subscript,
    superscript: node.superscript,
    width: getNodeWidth(canvas, { ...node, label: drawableLabel }),
    depth: depth,
    is_leaf: isLeaf,
    arrows: arrows,
    features: node.features || [],
    caseFeature: caseFeature,
    children: []
  };

  if (node.type !== Parser.NodeType.VALUE) {
    node.values.forEach(child => {
      drawable.children.push(drawableFromNode(canvas, child, (depth + 1), false));
    });
    drawable.width = getNodeWidth(canvas, { ...node, label: drawableLabel });
  }

  return drawable;
}

function getNodeWidth(canvas, node) {
  let label_width = node.type !== Parser.NodeType.ROOT
    ? canvas.textWidth(node.label) + NODE_PADDING
    : 0;

  if (node.subscript)
    label_width += canvas.textWidth(node.subscript) * 3 / 4 * 2;
  else if (node.superscript)
    label_width += canvas.textWidth(node.superscript) * 3 / 4 * 2;

  if (node.features && node.features.length > 0)
    label_width = Math.max(label_width, canvas.textWidth('[' + node.features.join(', ') + ']'));

  // Add case feature width for leaf nodes
  if (node.type === Parser.NodeType.VALUE && node.caseFeature) {
    let caseText = '[' + node.caseFeature.slice(1, -1) + ']';
    if (caseText.length > 100) {
      caseText = caseText.slice(0, 100) + '…]';
    }
    const caseWidth = canvas.textWidth(caseText) * 0.7 + NODE_PADDING;
    label_width = Math.max(label_width, caseWidth);
  }

  if (node.type !== Parser.NodeType.VALUE)
    return Math.max(label_width, getChildWidth(canvas, node));
  else
    return label_width;
}

function calculateDrawablePositions(canvas, drawable, vscaler, parent_offset = 0) {
  let offset = 0;
  let scale = 1;
  let hasArrow = drawable.arrows && drawable.arrows.length > 0;

  if (drawable.depth >= 0) {
    const child_width = getDrawableChildWidth(canvas, drawable);
    if (drawable.width > child_width) {
      scale = 1;
    }
  }

  drawable.children.forEach(child => {
    child.top = child.depth * (canvas.fontsize * 3 * vscaler) + NODE_PADDING / 2;
    child.left = offset + parent_offset;
    child.width *= scale;
    const child_has_arrow = calculateDrawablePositions(canvas, child, vscaler, child.left);
    if (child_has_arrow) hasArrow = true;
    offset += child.width;
  });

  return hasArrow;
}

function getChildWidth(canvas, node) {
  if (node.type === Parser.NodeType.VALUE) return 0;
  return node.values.reduce((sum, child) => sum + getNodeWidth(canvas, child), 0);
}

function getDrawableChildWidth(canvas, drawable) {
  return drawable.children.reduce((sum, child) => sum + child.width, 0);
}

function getMaxDepth(drawable) {
  return drawable.children.reduce((max, child) => Math.max(max, getMaxDepth(child)), drawable.depth);
}

function moveLeafsToBottom(drawable, bottom) {
  if (drawable.is_leaf) drawable.depth = bottom;
  drawable.children.forEach(child => moveLeafsToBottom(child, bottom));
}

function moveParentsDown(drawable) {
  if (drawable.is_leaf) return;
  drawable.children.forEach(child => moveParentsDown(child));
  if (drawable.depth !== 0) {
    drawable.depth = Math.min(...drawable.children.map(c => c.depth - 1));
  }
}

function calculateAutoSubscript(drawables) {
  const map = countNodes(drawables);
  for (const [key, value] of map.entries()) {
    if (value === 1) map.delete(key);
  }
  assignSubscripts(drawables, Array.from(map.keys()), new Map());
}

function assignSubscripts(drawable, keys, tally) {
  if (!drawable.is_leaf && !drawable.subscript && !drawable.superscript &&
      keys.includes(drawable.label)) {
    mapInc(tally, drawable.label);
    drawable.subscript = '' + tally.get(drawable.label);
  }
  drawable.children.forEach(child => assignSubscripts(child, keys, tally));
}

function countNodes(drawable) {
  let map = new Map();
  if (drawable.is_leaf) return map;
  if (!drawable.subscript) mapInc(map, drawable.label);
  drawable.children.forEach(child => map = mapMerge(map, countNodes(child)));
  return map;
}

function findTarget(drawable, arrow_idx) {
  const [count, target] = findTargetLeaf(drawable, arrow_idx, 0);
  return target;
}

function findTargetLeaf(drawable, arrow_idx, count) {
  if (drawable.is_leaf && (++count === arrow_idx))
    return [count, drawable];
  for (const child of drawable.children) {
    let target = null;
    [count, target] = findTargetLeaf(child, arrow_idx, count);
    if (target != null) return [count, target];
  }
  return [count, null];
}

function getDrawableCenter(drawable) {
  return drawable.left + drawable.width / 2;
}

function findMaxDepthBetween(drawable, left, right, max_y = 0) {
  drawable.children.forEach(child => {
    max_y = Math.max(findMaxDepthBetween(child, left, right, max_y), max_y);
  });
  if (drawable.is_leaf && drawable.left >= left && drawable.left <= right) {
    max_y = Math.max(drawable.top, max_y);
  }
  return max_y;
}

function makeArrowSet(root, fontsize) {
  return makeArrowSetOn(root, root, fontsize);
}

function makeArrowSetOn(root, drawable, fontsize) {
  const arrowSet = new ArrowSet();
  drawable.children.forEach(child => {
    arrowSet.concatenate(makeArrowSetOn(root, child, fontsize));
  });

  if (!drawable.is_leaf || !drawable.arrows || drawable.arrows.length === 0) return arrowSet;

  for (const arrowObj of drawable.arrows) {
    const target = findTarget(root, arrowObj.target);
    if (!target) continue;
    // Calculate label height for multi-line labels
    const labelLines = String(drawable.label).split(/\\n|\n/);
    const labelHeight = labelLines.length * fontsize * 1.1;
    const from = {
      x: getDrawableCenter(drawable),
      y: drawable.top + labelHeight + 2 + (drawable.caseFeature ? (fontsize * 0.7 + 2) : 0)
    };
    // Calculate label height for target as well
    const targetLabelLines = String(target.label).split(/\\n|\n/);
    const targetLabelHeight = targetLabelLines.length * fontsize * 1.1;
    const to = {
      x: getDrawableCenter(target),
      y: target.top + targetLabelHeight + 2 + (target.caseFeature ? (fontsize * 0.7 + 2) : 0)
    };
    const bottom = 1.4 * findMaxDepthBetween(root,
      Math.min(drawable.left, target.left),
      Math.max(drawable.left, target.left));
    const ends_to = arrowObj.ends.to;
    const ends_from = arrowObj.ends.from;
    const label = arrowObj.label || null;
    const dotted = arrowObj.dotted || false;
    arrowSet.add(new Arrow(from.x, from.y, to.x, to.y, bottom, ends_to, ends_from, label, dotted));
  }
  return arrowSet;
}

function mapInc(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function mapMerge(a, b) {
  b.forEach((value, key) => {
    a.set(key, (a.get(key) || 0) + value);
  });
  return a;
}


