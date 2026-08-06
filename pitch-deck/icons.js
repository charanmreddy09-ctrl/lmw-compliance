const React = require('react');
const ReactDOMServer = require('react-dom/server');
const sharp = require('sharp');
const Fa = require('react-icons/fa');

/** Render a react-icons component to a base64 PNG data URI string. */
async function iconPng(Comp, colorHex, sizePx = 256) {
  let svg = ReactDOMServer.renderToStaticMarkup(
    React.createElement(Comp, { color: '#' + colorHex, size: sizePx })
  );
  if (!/xmlns=/.test(svg)) {
    svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return 'image/png;base64,' + buf.toString('base64');
}

module.exports = { iconPng, Fa };
