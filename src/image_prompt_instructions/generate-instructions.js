// generate-instructions.js
const fs = require('fs');
const path = require('path');

const files = [
  'single_lifestyle_no_subject',
  'single_lifestyle_with_subject',
  'single_lifestyle_emotional',
  'single_studio',
  'single_closeup',
  'single_white_background',
  'multi_lifestyle_no_subject',
  'multi_lifestyle_with_subject',
  'multi_lifestyle_emotional',
  'multi_studio',
  'multi_closeup',
  'multi_white_background',
];

const dir = path.join(__dirname);

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

files.forEach(name => {
  const filePath = path.join(dir, `${name}.ts`);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `const instruction = \`\`;\nexport default instruction;\n`);
    console.log(`✅ Created ${name}.ts`);
  } else {
    console.log(`⚠️  Skipped ${name}.ts (already exists)`);
  }
});
