/**
 * Harness test tối giản — không dependency ngoài (luật cứng: KHÔNG npm install).
 * Báo pass/fail TỪNG CA để không ai tự nhận vống.
 */

const groups = [];
let currentGroup = null;

export function describe(name, fn) {
  currentGroup = { name, cases: [] };
  groups.push(currentGroup);
  fn();
  currentGroup = null;
}

export function it(name, fn) {
  if (!currentGroup) throw new Error('it() phải nằm trong describe()');
  currentGroup.cases.push({ name, fn });
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? 'assert thất bại');
}

export function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ?? 'không khớp'}\n  nhận:  ${a}\n  mong:  ${e}`);
}

export function throws(fn, matcher, msg) {
  let threw = null;
  try { fn(); } catch (e) { threw = e; }
  if (threw === null) throw new Error(msg ?? 'mong đợi ném lỗi nhưng không ném');
  if (typeof matcher === 'string' && !(threw.code === matcher || threw.name === matcher)) {
    throw new Error(`${msg ?? 'sai loại lỗi'}: nhận code=${threw.code} name=${threw.name}, mong ${matcher}`);
  }
  if (typeof matcher === 'function' && !matcher(threw)) {
    throw new Error(`${msg ?? 'lỗi không thoả điều kiện'}: ${threw.name}: ${threw.message}`);
  }
  return threw;
}

export async function rejects(promise, matcher, msg) {
  let threw = null;
  try { await promise; } catch (e) { threw = e; }
  if (threw === null) throw new Error(msg ?? 'mong đợi promise reject nhưng resolve');
  if (typeof matcher === 'string' && threw.code !== matcher) {
    throw new Error(`${msg ?? 'sai mã lỗi'}: nhận ${threw.code}, mong ${matcher}`);
  }
  if (typeof matcher === 'function' && !matcher(threw)) {
    throw new Error(`${msg ?? 'lỗi không thoả điều kiện'}: ${threw.name}: ${threw.message}`);
  }
  return threw;
}

export async function run() {
  let pass = 0; let fail = 0;
  const failures = [];
  for (const g of groups) {
    console.log(`\n\x1b[1m${g.name}\x1b[0m`);
    for (const c of g.cases) {
      try {
        await c.fn();
        pass += 1;
        console.log(`  \x1b[32m✓ PASS\x1b[0m  ${c.name}`);
      } catch (e) {
        fail += 1;
        failures.push({ group: g.name, name: c.name, err: e });
        console.log(`  \x1b[31m✗ FAIL\x1b[0m  ${c.name}`);
        console.log(`         ${String(e.message).split('\n').join('\n         ')}`);
      }
    }
  }
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`Tổng: ${pass + fail} ca · \x1b[32m${pass} pass\x1b[0m · ${fail > 0 ? `\x1b[31m${fail} fail\x1b[0m` : '0 fail'}`);
  if (fail > 0) {
    console.log('\nCa thất bại:');
    for (const f of failures) console.log(`  · ${f.group} › ${f.name}`);
  }
  return fail === 0;
}
