import type { z } from 'zod';

export async function fetchJsonObject<TData>(
  schema: z.Schema<TData>, // Accept any Zod schema
  ...args: Parameters<typeof fetch>
): Promise<TData> {
  const response = await fetch(...args);

  if (!response.ok) {
    const errorObject = await response.json();
    console.error('Error response:', JSON.stringify(errorObject, null, 2));
    throw new Error(`Request failed with status ${response.status} | ${response.statusText}`);
  }

  const jsonResponse = await response.json();
  return schema.parse(jsonResponse); // Validate and parse the response
}
