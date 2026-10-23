import fs from 'node:fs';
const files={};
for(const name of fs.readdirSync('data/downloads')) {
  files[name]={type:name.endsWith('.zip')?'application/zip':name.endsWith('.json')?'application/json':'text/csv;charset=utf-8',data:fs.readFileSync(`data/downloads/${name}`).toString('base64')};
}
fs.writeFileSync('app/data/private-downloads.json',JSON.stringify(files));
