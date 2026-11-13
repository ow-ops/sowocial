const ALPHABET = '234567abcdefghijklmnopqrstuvwxyz';

const clock = Math.floor(Math.random() * 32);
let last = 0;

// @atproto/common-web has the reference generator but is not a direct dependency. Microseconds since the epoch in
// 11 base32-sortable characters plus a 2 character clock id; strictly increasing within the process.
export function tid() {
  last = Math.max(Date.now() * 1000, last + 1);
  let time = last;
  let out = '';
  for (let i = 0; i < 11; i++) {
    out = ALPHABET[time % 32] + out;
    time = Math.floor(time / 32);
  }
  return `${out}2${ALPHABET[clock]}`;
}
