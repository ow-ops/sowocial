const post = json(http.get('http://localhost:8080/api/v1/statuses/' + BOB_PHOTO_ID, {
  headers: { Authorization: 'Bearer ' + BOB_TOKEN },
}).body);
output.alt = post.media_attachments[0].description;
