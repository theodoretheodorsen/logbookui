// `pattern` only validates at submit time - these enforce the shape of a
// text input immediately as the user types.

export function restrictDigits(input, maxLength) {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, maxLength);
  });
}

export function restrictUppercase(input, maxLength) {
  input.addEventListener('input', () => {
    input.value = input.value.toUpperCase().slice(0, maxLength);
  });
}
