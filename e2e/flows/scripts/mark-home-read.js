// Marks bob's oldest home post as read, so newer posts leave a place to jump back to.
const home = json(http.get('http://localhost:8080/api/v1/timelines/home?limit=40', {
  headers: { Authorization: 'Bearer ' + BOB_TOKEN },
}).body);
http.post('http://localhost:8080/api/v1/markers', {
  headers: { Authorization: 'Bearer ' + BOB_TOKEN, 'Content-Type': 'application/json' },
  body: JSON.stringify({ home: { last_read_id: home[home.length - 1].id } }),
});
