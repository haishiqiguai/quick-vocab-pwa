import fs from 'node:fs/promises';

const source = 'resources/android-audio';
const destination = 'dist';

await fs.cp(source, destination, { recursive: true, force: true });
console.log(`Staged Android-only audio from ${source} into ${destination}`);
