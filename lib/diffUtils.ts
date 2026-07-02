export function computeDiff(oldText: string, newText: string) {
  const oldLines = oldText.split("\n")
  const newLines = newText.split("\n")

  const result: {
    type: "added" | "removed" | "unchanged"
    value: string
  }[] = []

  const max = Math.max(oldLines.length, newLines.length)

  for (let i = 0; i < max; i++) {
    const oldLine = oldLines[i]
    const newLine = newLines[i]

    if (oldLine === newLine) {
      result.push({ type: "unchanged", value: newLine || "" })
    } else {
      if (oldLine) {
        result.push({ type: "removed", value: oldLine })
      }
      if (newLine) {
        result.push({ type: "added", value: newLine })
      }
    }
  }

  return result
}