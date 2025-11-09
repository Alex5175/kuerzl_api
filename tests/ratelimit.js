for (let i = 0; i < 200; i++) {
  const res = await fetch("http://localhost:3000/status");
  console.log(res);
}
