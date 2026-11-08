# Tests removed — 2026-11-08

The fixture test suites in this repo were removed on Scott's direct
order (2026-11-07): "Remove all the tests. Everywhere. No tests
should remain."

Why, in Scott's terms:

- The tests were detrimental and negative. They consumed the time
  and tokens that were supposed to go to researching the problem
  and fixing it.
- Building them created loops: write tests, fix tests, bend the
  code to satisfy the tests, write more tests — more tokens, less
  finished, more pretend.
- They were lies: green checkmarks over systems that don't work.
  A suite passing against fixtures proved nothing about the real
  system in real use.
- Unloopr's own verdict: the tests are lies. They existed to prove
  we were right, not that the code works. Being right, or the code
  actually working — only one of those matters.

What replaced them: using the system the way a user will, on real
data, and bringing back what it produced. That output is the only
proof this fleet accepts now.

Removal inventory for this repo: 31 test files,
~27 test cases. Test commands and test-only dependencies
were removed from build/CI configuration in the same change.
