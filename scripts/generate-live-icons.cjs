// Render the checked-in vector icon using the sharp dependency bundled with Next.
const sharp = require('sharp');
const path = require('node:path');
const directory = path.join(__dirname, '..', 'public');
Promise.all([180, 192, 512].map(size => sharp(path.join(directory, 'live-icon.svg'))
  .resize(size, size).png().toFile(path.join(directory, `live-icon-${size}.png`))))
  .catch(error => { console.error(error); process.exitCode = 1; });
