/**
 * 极简断言工具（无第三方依赖）
 */

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  \u2713 ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.log(`  \u2717 ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message} (期望: ${expected}, 实际: ${actual})`);
}

function summary() {
  console.log('\n----------------------------------------');
  console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
  if (failures.length) {
    console.log('失败项:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  console.log('----------------------------------------');
  return failed === 0;
}

module.exports = { assert, assertEqual, summary };
