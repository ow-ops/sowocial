//! Matches Jetstream commit events to the DIDs they concern. Pure: whether a DID is registered
//! is a closure the caller passes in.

use std::borrow::Cow;

use serde::Deserialize;
use serde_json::json;
use serde_json::value::RawValue;

const BODY_CHARS: usize = 280;
const MENTION: &str = "app.bsky.richtext.facet#mention";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Kind {
    Like,
    Repost,
    Follow,
    Reply,
    Quote,
    Mention,
}

#[derive(Debug, PartialEq, Eq)]
pub(super) struct Notice {
    pub(super) recipient: String,
    pub(super) kind: Kind,
    pub(super) text: Option<String>,
}

/// A `create` commit, borrowing from the message text. The record stays unparsed until
/// `notices` knows which collection to read it as.
#[derive(Debug)]
pub(super) struct Commit<'a> {
    pub(super) seq: u64,
    pub(super) did: Cow<'a, str>,
    collection: Cow<'a, str>,
    record: &'a RawValue,
}

/// A string that borrows from the message when it has no escapes. Serde borrows a `Cow<str>` only
/// when it is not wrapped in an `Option`, so the optional fields use this.
#[derive(Deserialize)]
struct Str<'a>(#[serde(borrow)] Cow<'a, str>);

impl std::ops::Deref for Str<'_> {
    type Target = str;

    fn deref(&self) -> &str {
        &self.0
    }
}

#[derive(Deserialize)]
struct Envelope<'a> {
    #[serde(borrow)]
    payload: Option<Payload<'a>>,
}

// Every field is optional: identity and account events carry none of the commit fields.
#[derive(Deserialize)]
struct Payload<'a> {
    #[serde(rename = "$type", borrow)]
    kind: Option<Str<'a>>,
    #[serde(borrow)]
    operation: Option<Str<'a>>,
    seq: Option<u64>,
    #[serde(borrow)]
    did: Option<Str<'a>>,
    #[serde(borrow)]
    collection: Option<Str<'a>>,
    #[serde(borrow)]
    record: Option<&'a RawValue>,
}

/// The `create` commits in a Jetstream `subscribeEvents` message. Other operations and kinds
/// return `None`.
pub(super) fn parse_commit(text: &str) -> Option<Commit<'_>> {
    let payload = serde_json::from_str::<Envelope>(text).ok()?.payload?;
    if !payload.kind?.ends_with("#commit") || *payload.operation? != *"create" {
        return None;
    }
    Some(Commit {
        seq: payload.seq?,
        did: payload.did?.0,
        collection: payload.collection?.0,
        record: payload.record?,
    })
}

// The record shapes below read only the fields a notification needs. A record that does not
// have the lexicon's shape fails to parse and notifies nobody.
#[derive(Deserialize)]
struct Subject<'a> {
    #[serde(borrow)]
    uri: Option<Str<'a>>,
}

#[derive(Deserialize)]
struct Interaction<'a> {
    #[serde(borrow)]
    subject: Option<Subject<'a>>,
}

#[derive(Deserialize)]
struct Follow<'a> {
    #[serde(borrow)]
    subject: Option<Str<'a>>,
}

#[derive(Deserialize)]
struct Post<'a> {
    // Left raw: decoding allocates when it holds escapes, and most posts reach nobody.
    #[serde(borrow)]
    text: Option<&'a RawValue>,
    #[serde(borrow)]
    reply: Option<Reply<'a>>,
    #[serde(borrow)]
    embed: Option<Embed<'a>>,
}

// Read apart from `Post`, and only for records that name a mention, because a facet list
// allocates for every link and tag in it.
#[derive(Deserialize)]
struct Facets<'a> {
    #[serde(borrow)]
    facets: Option<Vec<Facet<'a>>>,
}

#[derive(Deserialize)]
struct Reply<'a> {
    #[serde(borrow)]
    parent: Option<Subject<'a>>,
}

#[derive(Deserialize)]
struct Embed<'a> {
    #[serde(borrow)]
    record: Option<EmbeddedRecord<'a>>,
}

// `embed.record` quotes directly; `embed.recordWithMedia` nests the quote one level down.
#[derive(Deserialize)]
struct EmbeddedRecord<'a> {
    #[serde(borrow)]
    uri: Option<Str<'a>>,
    #[serde(borrow)]
    record: Option<Subject<'a>>,
}

#[derive(Deserialize)]
struct Facet<'a> {
    #[serde(borrow)]
    features: Option<Vec<Feature<'a>>>,
}

#[derive(Deserialize)]
struct Feature<'a> {
    #[serde(rename = "$type", borrow)]
    kind: Option<Str<'a>>,
    #[serde(borrow)]
    did: Option<Str<'a>>,
}

/// The DID in the authority of an `at://` URI, if it names one.
fn at_uri(uri: Option<Str<'_>>) -> Option<Cow<'_, str>> {
    fn authority(uri: &str) -> Option<&str> {
        let authority = uri.strip_prefix("at://")?.split('/').next()?;
        authority.starts_with("did:").then_some(authority)
    }
    match uri?.0 {
        Cow::Borrowed(uri) => authority(uri).map(Cow::Borrowed),
        Cow::Owned(uri) => authority(&uri).map(|did| Cow::Owned(did.to_owned())),
    }
}

/// Keeps a candidate only if it is a registered account other than the actor and not already
/// notified, so nothing is allocated for the accounts the relay does not serve.
struct Collector<'a, F> {
    actor: &'a str,
    registered: F,
    found: Vec<Notice>,
}

impl<F: Fn(&str) -> bool> Collector<'_, F> {
    fn add(&mut self, recipient: Option<Cow<'_, str>>, kind: Kind) {
        let Some(recipient) = recipient else { return };
        if *recipient == *self.actor
            || !(self.registered)(&recipient)
            || self
                .found
                .iter()
                .any(|notice| notice.recipient == *recipient)
        {
            return;
        }
        self.found.push(Notice {
            recipient: recipient.into_owned(),
            kind,
            text: None,
        });
    }
}

/// Every registered account an event should notify, each once, with the reason that a device
/// sees. The actor is never notified about their own action.
pub(super) fn notices(commit: &Commit<'_>, registered: impl Fn(&str) -> bool) -> Vec<Notice> {
    let mut found = Collector {
        actor: &commit.did,
        registered,
        found: Vec::new(),
    };
    let record = commit.record.get();
    match &*commit.collection {
        collection @ ("app.bsky.feed.like" | "app.bsky.feed.repost") => {
            let kind = if collection == "app.bsky.feed.like" {
                Kind::Like
            } else {
                Kind::Repost
            };
            if let Ok(interaction) = serde_json::from_str::<Interaction>(record) {
                let uri = interaction.subject.and_then(|subject| subject.uri);
                found.add(at_uri(uri), kind);
            }
        }
        "app.bsky.graph.follow" => {
            if let Ok(follow) = serde_json::from_str::<Follow>(record) {
                let did = follow.subject.filter(|did| did.starts_with("did:"));
                found.add(did.map(|did| did.0), Kind::Follow);
            }
        }
        "app.bsky.feed.post" => {
            if let Ok(post) = serde_json::from_str::<Post>(record) {
                let parent = post
                    .reply
                    .and_then(|reply| reply.parent)
                    .and_then(|parent| parent.uri);
                found.add(at_uri(parent), Kind::Reply);
                let quoted = post
                    .embed
                    .and_then(|embed| embed.record)
                    .and_then(|quoted| quoted.uri.or(quoted.record.and_then(|nested| nested.uri)));
                found.add(at_uri(quoted), Kind::Quote);
                if record.contains(MENTION) {
                    let Ok(parsed) = serde_json::from_str::<Facets>(record) else {
                        return Vec::new();
                    };
                    let mentions = parsed
                        .facets
                        .into_iter()
                        .flatten()
                        .flat_map(|facet| facet.features.into_iter().flatten())
                        .filter(|feature| feature.kind.as_deref() == Some(MENTION));
                    for feature in mentions {
                        found.add(feature.did.map(|did| did.0), Kind::Mention);
                    }
                }
                if let (false, Some(raw)) = (found.found.is_empty(), post.text) {
                    let Ok(text) = serde_json::from_str::<Str>(raw.get()) else {
                        return Vec::new();
                    };
                    for notice in &mut found.found {
                        notice.text = Some(text.0.to_string());
                    }
                }
            }
        }
        _ => {}
    }
    found.found
}

/// The plaintext the device decrypts: `did` routes it to the account, the rest is shown.
pub(super) fn message(notice: &Notice, actor_name: &str) -> serde_json::Value {
    let action = match notice.kind {
        Kind::Like => "liked your post",
        Kind::Repost => "reposted your post",
        Kind::Follow => "followed you",
        Kind::Reply => "replied to you",
        Kind::Quote => "quoted your post",
        Kind::Mention => "mentioned you",
    };
    let body: String = notice
        .text
        .as_deref()
        .unwrap_or_default()
        .chars()
        .take(BODY_CHARS)
        .collect();
    json!({
        "did": notice.recipient,
        "title": format!("{actor_name} {action}"),
        "body": body,
    })
}

#[cfg(test)]
mod tests {
    use serde_json::Value;

    use super::*;

    fn event(collection: &str, record: &Value) -> String {
        json!({
            "$type": "message",
            "payload": {
                "$type": "network.bsky.jetstream.subscribeEvents#commit",
                "did": "did:plc:actor",
                "seq": 1,
                "operation": "create",
                "collection": collection,
                "record": record,
            }
        })
        .to_string()
    }

    fn notified_when(
        collection: &str,
        record: &Value,
        registered: impl Fn(&str) -> bool,
    ) -> Vec<Notice> {
        let text = event(collection, record);
        let commit = parse_commit(&text).expect("a create commit");
        notices(&commit, registered)
    }

    fn notified(collection: &str, record: &Value) -> Vec<Notice> {
        notified_when(collection, record, |_| true)
    }

    #[test]
    fn parses_create_commits_only() {
        let create = json!({
            "$type": "message",
            "payload": {
                "$type": "network.bsky.jetstream.subscribeEvents#commit",
                "did": "did:plc:actor",
                "seq": 24_664_288_881_u64,
                "operation": "create",
                "collection": "app.bsky.feed.like",
                "record": { "subject": { "uri": "at://did:plc:owner/app.bsky.feed.post/1" } }
            }
        });
        let text = create.to_string();
        let parsed = parse_commit(&text).expect("a create commit");
        assert_eq!(parsed.seq, 24_664_288_881);
        assert_eq!(parsed.did, "did:plc:actor");
        assert_eq!(parsed.collection, "app.bsky.feed.like");
        assert!(matches!(parsed.did, Cow::Borrowed(_)));

        let mut delete = create.clone();
        delete["payload"]["operation"] = json!("delete");
        assert!(parse_commit(&delete.to_string()).is_none());
        assert!(parse_commit(r#"{"$type":"message","payload":{"$type":"x#identity"}}"#).is_none());
        assert!(parse_commit("not json").is_none());
    }

    #[test]
    fn a_like_notifies_the_liked_post_author() {
        let record = json!({ "subject": { "uri": "at://did:plc:owner/app.bsky.feed.post/1" } });
        let notices = notified("app.bsky.feed.like", &record);
        assert_eq!(
            notices,
            vec![Notice {
                recipient: "did:plc:owner".to_owned(),
                kind: Kind::Like,
                text: None,
            }]
        );
    }

    #[test]
    fn a_repost_notifies_the_reposted_post_author() {
        let record = json!({ "subject": { "uri": "at://did:plc:owner/app.bsky.feed.post/1" } });
        let notices = notified("app.bsky.feed.repost", &record);
        assert_eq!(notices.len(), 1);
        assert_eq!(notices[0].kind, Kind::Repost);
        assert_eq!(notices[0].recipient, "did:plc:owner");
    }

    #[test]
    fn a_follow_notifies_the_followed_account() {
        let notices = notified(
            "app.bsky.graph.follow",
            &json!({ "subject": "did:plc:owner" }),
        );
        assert_eq!(notices.len(), 1);
        assert_eq!(notices[0].kind, Kind::Follow);
        assert_eq!(notices[0].recipient, "did:plc:owner");
    }

    #[test]
    fn a_reply_notifies_the_parent_author_with_the_text() {
        let record = json!({
            "text": "agreed",
            "reply": {
                "root": { "uri": "at://did:plc:root/app.bsky.feed.post/a", "cid": "x" },
                "parent": { "uri": "at://did:plc:owner/app.bsky.feed.post/b", "cid": "x" }
            }
        });
        let notices = notified("app.bsky.feed.post", &record);
        assert_eq!(notices.len(), 1);
        assert_eq!(notices[0].kind, Kind::Reply);
        assert_eq!(notices[0].recipient, "did:plc:owner");
        assert_eq!(notices[0].text.as_deref(), Some("agreed"));
    }

    #[test]
    fn a_mention_facet_notifies_the_mentioned_account() {
        let record = json!({
            "text": "hi @someone",
            "facets": [{
                "index": { "byteStart": 3, "byteEnd": 11 },
                "features": [{ "$type": "app.bsky.richtext.facet#mention", "did": "did:plc:owner" }]
            }]
        });
        let notices = notified("app.bsky.feed.post", &record);
        assert_eq!(notices.len(), 1);
        assert_eq!(notices[0].kind, Kind::Mention);
        assert_eq!(notices[0].recipient, "did:plc:owner");
    }

    #[test]
    fn facets_are_read_only_when_the_record_names_a_mention() {
        let reply = json!({ "parent": { "uri": "at://did:plc:owner/app.bsky.feed.post/b" } });
        let quote = json!({ "record": { "uri": "at://did:plc:quoted/app.bsky.feed.post/1" } });
        // Facets that would fail to parse prove they are skipped without the marker.
        let record = json!({
            "text": "no mention",
            "reply": reply,
            "embed": quote,
            "facets": "not a list",
        });
        let found = notified("app.bsky.feed.post", &record);
        let kinds: Vec<_> = found.iter().map(|notice| notice.kind).collect();
        assert_eq!(kinds, [Kind::Reply, Kind::Quote]);
        assert_eq!(found[0].recipient, "did:plc:owner");
        assert_eq!(found[1].recipient, "did:plc:quoted");
        assert!(
            found
                .iter()
                .all(|n| n.text.as_deref() == Some("no mention"))
        );

        let broken = json!({
            "text": "x",
            "reply": reply,
            "facets": [{ "features": "did:plc:owner app.bsky.richtext.facet#mention" }],
        });
        assert_eq!(notified("app.bsky.feed.post", &broken), Vec::new());
    }

    #[test]
    fn post_text_is_decoded_only_for_a_recipient() {
        let record = json!({
            "text": "line\nbreak",
            "reply": { "parent": { "uri": "at://did:plc:owner/app.bsky.feed.post/b" } },
        });
        assert_eq!(
            notified_when("app.bsky.feed.post", &record, |_| false),
            Vec::new()
        );
        // A text of the wrong type notifies nobody, as when the whole record failed to parse.
        let wrong = json!({
            "text": 5,
            "reply": { "parent": { "uri": "at://did:plc:owner/app.bsky.feed.post/b" } },
        });
        assert_eq!(notified("app.bsky.feed.post", &wrong), Vec::new());
    }

    #[test]
    fn a_link_facet_is_not_a_mention() {
        let record = json!({
            "text": "see example",
            "facets": [{ "features": [{ "$type": "app.bsky.richtext.facet#link", "uri": "https://example.com" }] }]
        });
        assert_eq!(notified("app.bsky.feed.post", &record), Vec::new());
    }

    #[test]
    fn a_quote_notifies_the_quoted_author_in_both_embed_shapes() {
        let plain = json!({
            "text": "look",
            "embed": { "$type": "app.bsky.embed.record", "record": { "uri": "at://did:plc:owner/app.bsky.feed.post/1", "cid": "x" } }
        });
        let with_media = json!({
            "text": "look",
            "embed": { "$type": "app.bsky.embed.recordWithMedia", "record": { "record": { "uri": "at://did:plc:owner/app.bsky.feed.post/1", "cid": "x" } } }
        });
        for record in [plain, with_media] {
            let notices = notified("app.bsky.feed.post", &record);
            assert_eq!(notices.len(), 1);
            assert_eq!(notices[0].kind, Kind::Quote);
            assert_eq!(notices[0].recipient, "did:plc:owner");
        }
    }

    #[test]
    fn a_reply_that_also_mentions_notifies_once_with_the_reply() {
        let record = json!({
            "text": "@owner yes",
            "reply": { "parent": { "uri": "at://did:plc:owner/app.bsky.feed.post/b" } },
            "facets": [{ "features": [{ "$type": "app.bsky.richtext.facet#mention", "did": "did:plc:owner" }] }]
        });
        let notices = notified("app.bsky.feed.post", &record);
        assert_eq!(notices.len(), 1);
        assert_eq!(notices[0].kind, Kind::Reply);
    }

    #[test]
    fn never_notifies_about_own_actions() {
        let own_like = json!({ "subject": { "uri": "at://did:plc:actor/app.bsky.feed.post/1" } });
        assert_eq!(notified("app.bsky.feed.like", &own_like), Vec::new());
        let own_reply =
            json!({ "reply": { "parent": { "uri": "at://did:plc:actor/app.bsky.feed.post/1" } } });
        assert_eq!(notified("app.bsky.feed.post", &own_reply), Vec::new());
    }

    #[test]
    fn ignores_handles_and_other_collections() {
        let handle = json!({ "subject": { "uri": "at://alice.example/app.bsky.feed.post/1" } });
        assert_eq!(notified("app.bsky.feed.like", &handle), Vec::new());
        let other = json!({ "subject": { "uri": "at://did:plc:owner/app.bsky.feed.post/1" } });
        assert_eq!(notified("app.bsky.feed.generator", &other), Vec::new());
    }

    #[test]
    fn only_registered_recipients_become_notices() {
        let record = json!({
            "text": "hi",
            "reply": { "parent": { "uri": "at://did:plc:stranger/app.bsky.feed.post/b" } },
            "facets": [
                { "features": [{ "$type": "app.bsky.richtext.facet#mention", "did": "did:plc:owner" }] },
                { "features": [{ "$type": "app.bsky.richtext.facet#mention", "did": "did:plc:other" }] }
            ]
        });
        let text = event("app.bsky.feed.post", &record);
        let commit = parse_commit(&text).expect("a create commit");

        let asked = std::cell::RefCell::new(Vec::new());
        let found = notices(&commit, |did| {
            asked.borrow_mut().push(did.to_owned());
            did == "did:plc:owner"
        });
        assert_eq!(
            found,
            vec![Notice {
                recipient: "did:plc:owner".to_owned(),
                kind: Kind::Mention,
                text: Some("hi".to_owned()),
            }]
        );
        assert_eq!(
            asked.into_inner(),
            ["did:plc:stranger", "did:plc:owner", "did:plc:other"]
        );
        assert_eq!(notices(&commit, |_| false), Vec::new());
    }

    #[test]
    fn escaped_post_text_still_parses() {
        let record = json!({
            "text": "line\nbreak \"quoted\"",
            "reply": { "parent": { "uri": "at://did:plc:owner/app.bsky.feed.post/b" } }
        });
        let found = notified("app.bsky.feed.post", &record);
        assert_eq!(found[0].text.as_deref(), Some("line\nbreak \"quoted\""));
    }

    #[test]
    fn message_names_the_actor_and_routes_to_the_recipient() {
        let notice = Notice {
            recipient: "did:plc:owner".to_owned(),
            kind: Kind::Like,
            text: None,
        };
        let value = message(&notice, "Alice");
        assert_eq!(value["did"], "did:plc:owner");
        assert_eq!(value["title"], "Alice liked your post");
        assert_eq!(value["body"], "");
    }

    #[test]
    fn message_truncates_long_bodies() {
        let notice = Notice {
            recipient: "did:plc:owner".to_owned(),
            kind: Kind::Reply,
            text: Some("é".repeat(400)),
        };
        let value = message(&notice, "Alice");
        assert_eq!(
            value["body"].as_str().map(|s| s.chars().count()),
            Some(BODY_CHARS)
        );
    }
}
