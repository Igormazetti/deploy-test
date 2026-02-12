function add(a: number, b: number): number {
  return a + b;
}

function runTests(): void {
  console.log("Running tests\n");

  const result1 = add(2, 3);
  if (result1 !== 5) {
    console.error(`FAIL: add(2, 3) expected 5 but got ${result1}`);
    process.exit(1);
  }
  console.log("PASS: add(2, 3) = 5");

  const result2 = add(-1, 1);
  if (result2 !== 0) {
    console.error(`FAIL: add(-1, 1) expected 0 but got ${result2}`);
    process.exit(1);
  }
  console.log("PASS: add(-1, 1) = 0");

  const result3 = add(0, 0);
  if (result3 !== 0) {
    console.error(`FAIL: add(0, 0) expected 0 but got ${result3}`);
    process.exit(1);
  }
  console.log("PASS: add(0, 0) = 0");

  const result4 = add(1000000, 2000000);
  if (result4 !== 3000000) {
    console.error(`FAIL: add(1000000, 2000000) expected 3000000 but got ${result4}`);
    process.exit(1);
  }
  console.log("PASS: add(1000000, 2000000) = 3000000");

  const result5 = add(10, 20);
  if (result5 !== 30) {
    console.error(`FAIL: add(10, 20) expected 30 but got ${result5}`);
    process.exit(1);
  }
  console.log("PASS: add(10, 20) = 30");

  console.log("\nAll tests passed!");
}

runTests();
