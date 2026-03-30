import re

# 1. Remove ThemeToggle from Header
with open('src/components/Header.astro') as f:
    header = f.read()

# Remove import
header = header.replace("import ThemeToggle from './ThemeToggle.astro';\n", "")

# Remove desktop ThemeToggle + divider before it
header = header.replace('      <div class="w-px h-5 mx-2" style="background: var(--border);"></div>\n      <ThemeToggle />', '')

# Remove mobile ThemeToggle
header = header.replace('      <ThemeToggle />\n', '')

with open('src/components/Header.astro', 'w') as f:
    f.write(header)
print('Header: ThemeToggle removed')

# 2. Remove dark mode from global.css
with open('src/styles/global.css') as f:
    css = f.read()

# Remove :root.dark block
css = re.sub(r':root\.dark\s*\{[^}]+\}', '', css)

# Remove all .dark .xxx rules
css = re.sub(r'\.dark\s+\.[^\{]+\{[^}]+\}', '', css)

# Clean up multiple blank lines
css = re.sub(r'\n{3,}', '\n\n', css)

with open('src/styles/global.css', 'w') as f:
    f.write(css)
print('CSS: dark mode rules removed')

# 3. Remove theme script from BaseLayout
with open('src/layouts/BaseLayout.astro') as f:
    bl = f.read()

# Replace theme script with simple light mode
bl = bl.replace(
    """  <script is:inline>
    const theme = localStorage.getItem('theme') || 'light';
    document.documentElement.classList.toggle('dark', theme === 'dark');
  </script>""",
    "  <!-- Always light mode -->"
)

with open('src/layouts/BaseLayout.astro', 'w') as f:
    f.write(bl)
print('BaseLayout: theme script removed')

print('DONE - Dark mode completely removed')
