use std::env;

pub(crate) fn env_var(name: &str) -> Option<String> {
    env::var(name).ok().filter(|value| !value.is_empty())
}
