#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'

const HELPER_MARKER = '\ntype DatabaseWithoutInternals ='

for (const filePath of process.argv.slice(2)) {
  const generatedTypes = readFileSync(filePath, 'utf8')
  const helperStart = generatedTypes.indexOf(HELPER_MARKER)

  if (!generatedTypes.includes('export type Database = {') || helperStart === -1) {
    throw new Error(`Unrecognized Supabase generated types: ${filePath}`)
  }

  writeFileSync(filePath, `${generatedTypes.slice(0, helperStart).trimEnd()}\n`)
}
