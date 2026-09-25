const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const gradle = fs.readFileSync(path.join(root, 'app', 'build.gradle'), 'utf8');
const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
const generator = fs.readFileSync(path.join(root, 'tools', 'signing', 'create-release-keystore.ps1'), 'utf8');

test('release signing 固定 alias 且只从环境读取密码', () => {
  assert.match(gradle, /keyAlias\s+"questionbank-release"/);
  assert.match(gradle, /System\.getenv\("QBANK_RELEASE_STORE_PASSWORD"\)/);
  assert.match(gradle, /System\.getenv\("QBANK_RELEASE_KEY_PASSWORD"\)/);
  assert.doesNotMatch(gradle, /storePassword\s+["'][^"']+["']/);
  assert.doesNotMatch(gradle, /keyPassword\s+["'][^"']+["']/);
});

test('签名材料被 Git 排除且生成脚本不携带密码', () => {
  for (const pattern of ['*.jks', '*.keystore', '*.p12', '*.pfx', '*.key']) assert.ok(ignore.includes(pattern));
  assert.match(generator, /questionbank-release/);
  assert.doesNotMatch(generator, /-storepass\b|-keypass\b/);
});
