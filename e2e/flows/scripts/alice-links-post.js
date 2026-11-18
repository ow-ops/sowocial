// Alice links her thread's first post the way servers without quote posts quote one.
const auth = { Authorization: 'Bearer ' + ALICE_TOKEN };
const me = json(http.get('http://localhost:8080/api/v1/accounts/verify_credentials', { headers: auth }).body);
const posts = json(http.get('http://localhost:8080/api/v1/accounts/' + me.id + '/statuses?limit=40', { headers: auth }).body);
const quoted = posts.find((p) => p.content.includes('Stroopwafel thread part one'));
http.post('http://localhost:8080/api/v1/statuses', {
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ status: 'Still thinking about it\n\nRE: ' + quoted.url, visibility: 'public' }),
});
