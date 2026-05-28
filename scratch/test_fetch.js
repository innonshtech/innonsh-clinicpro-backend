import fetch from 'node-fetch';

async function testFetch() {
  const docId = '69e07658fb082785558c40e8';
  const url = `http://localhost:3001/api/v1/appointment/fetchbydoctor/${docId}`;
  
  const res = await fetch(url);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

testFetch().catch(console.error);
