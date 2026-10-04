# decision-packet

`decision-packet` validates one public, non-authoritative `decision-packet/1`, projects it deterministically into `semantic-map-envelope/3`, and delegates rendering to the existing `semantic-map` package.

It owns packet validation and packet-to-map meaning only. It does not own accepted ADRS state, publication routes, deployment, customer actions, or transaction authority.
