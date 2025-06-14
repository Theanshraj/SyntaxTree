'use strict';

// Array of helpful tips for using the SyntaxTree app.
// These are shown to the user in the UI, one at a time.
const tips = [
  'Click on the syntax tree image to download a copy.',
  'SyntaxTree works offline, instantly updates and handles unicode fonts.',
  'You can right-click the image and copy &amp; paste the graph into your document editor.',
  'The graph will update automatically once a matching number of brackets is detected.',
  'Add manual subscripts to nodes using an underscore character.<br />' +
      'Example: <a href="?[N_s%20Dogs]">[N_s Dogs]</a>',
  'Add manual superscript to nodes using the ^ character.<br />' +
      'Example: <a href="?[N^s%20Cats]">[N^s Cats]</a>',
  'You can add spaces to nodes by putting them inside double quotes.<br />' +
      'Example: <a href="?[&quot;Main%20clause&quot;%20[S][V][O]]">[&quot;Main clause&quot; [S][V][O]]</a>',
  'Add arrows to a node by using an -&gt;, &lt- or &lt;&gt; arrow followed by column number.<br />' +
      'Example: <a href="?[A%20[B%20C][D%20E][F%20G%20->1]]">[A [B C][D E][F G ->1]]</a>'
];

// Start with a random tip index so the first tip shown is random
let tip_idx = Math.floor(Math.random() * tips.length);

// Rotates the tip shown in the UI by updating the #tip element's HTML.
// Each call shows the next tip in the array, cycling back to the start.
export default function rotateTip() {
  document.getElementById('tip').innerHTML =
      '<strong>Tip:</strong> ' + tips[tip_idx++ % tips.length];
}
