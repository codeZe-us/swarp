const fs = require('fs');
const files = ['app/faucet/page.tsx', 'app/page.tsx', 'app/payroll/page.tsx', 'app/swap/page.tsx', 'app/team/page.tsx'];
files.forEach(f => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    content = content.replace(/type:\s*'error'/g, "severity: 'error'");
    content = content.replace(/type:\s*'success'/g, "severity: 'success'");
    content = content.replace(/type:\s*'info'/g, "severity: 'info'");
    content = content.replace(/type:\s*'warning'/g, "severity: 'warning'");
    fs.writeFileSync(f, content);
    console.log('Fixed', f);
  }
});
