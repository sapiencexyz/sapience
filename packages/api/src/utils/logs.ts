export function log({
  message,
  prefix,
  indent,
}: {
  message: string;
  prefix?: string;
  indent?: number;
}) {
  const caller =
    new Error().stack?.split('\n')[2]?.trim()?.split(' ')[1] || 'unknown';
  if (!prefix) {
    prefix = '';
  } else {
    prefix += ' ';
  }
  const indentSpaces = ' '.repeat(indent || 0);

  console.log(`${prefix}[${caller}]${indentSpaces} ${message}`);
}
