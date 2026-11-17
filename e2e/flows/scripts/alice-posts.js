http.post('http://localhost:8080/api/v1/statuses', {
  headers: { Authorization: 'Bearer ' + ALICE_TOKEN, 'Content-Type': 'application/json' },
  body: JSON.stringify({ status: 'A post that arrives while bob reads', visibility: 'public' }),
});
