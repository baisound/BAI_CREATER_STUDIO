// Parse only a registered PMX supplied by the Python server.  The parser is
// the same Three.js MMD parser family used by the browser model loader.
import fs from 'node:fs';
import {MMDParser} from '../node_modules/three/examples/jsm/libs/mmdparser.module.js';

if(process.argv.length!==3)process.exit(2);
const bytes=fs.readFileSync(process.argv[2]);
const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const names=new MMDParser.Parser().parsePmx(buffer,true).morphs.map(row=>row.name);
process.stdout.write(JSON.stringify(names));
