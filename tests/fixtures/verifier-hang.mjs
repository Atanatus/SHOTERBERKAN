// Test-only child that intentionally never replies to the parent.
process.on('message', () => {});
