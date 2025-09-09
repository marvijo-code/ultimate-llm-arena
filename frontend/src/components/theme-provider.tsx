import * as React from "react"
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes"
import { useTheme as useNextTheme } from "next-themes"

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider
    attribute="class"
    defaultTheme="dark"
    enableSystem={false}
    disableTransitionOnChange
    {...props}
  >
    {children}
  </NextThemesProvider>
}

export const useTheme = useNextTheme