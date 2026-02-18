import prisma from '../../db';

export async function getStringParam(key: string): Promise<string | null> {
  const record = await prisma.keyValueStore.findUnique({
    where: { key },
  });
  return record?.value ?? null;
}

export async function setStringParam(
  key: string,
  value: string | null
): Promise<void> {
  if (value === null) {
    await prisma.keyValueStore.delete({ where: { key } }).catch(() => {
      // Ignore if key doesn't exist
    });
  } else {
    await prisma.keyValueStore.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}
