export function cleanProductName(name: string): string {
    return name
      .replace(/^Personal[zi]sed\s+/i, '')
      .replace(/^Photo\s+/i, '')
      .trim()
      .split(' ')
      .map(word => word[0].toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  
  export function parseProductsFromString(input: string): string[] {
    const match = input.match(/products?\s*[:=]\s*\[(.*?)\]/i);
    if (!match) return [];
    return match[1].split(',').map(p => p.replace(/["']/g, '').trim());
  }
  