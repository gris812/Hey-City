# Hey City internal TestFlight

This workflow uploads a staging-backed beta to the existing App Store Connect record. Apple processing and assignment to an internal testing group are separate from the upload. No App Store release or external beta review is requested by this workflow.

## Public Support prerequisite

The approved file is `web/support/index.html` from PR #36. Review and pin the file before deployment. The public host resolves to the Hey City VPS. The repository web service maps 127.0.0.1:4180 to static Nginx, where unknown paths fall back to the app index. Check the live front-end virtual host before changing it. Do not merge PR #36 to trigger publication: the existing main workflow can rebuild the API and run the full production Compose project.

On the authorized VPS session, publish just the pinned HTML as `/var/www/heycity-support/index.html` using a same-directory temporary file and atomic rename. If the HTTPS front end uses Nginx, add these exact locations inside the existing HTTPS **web** virtual host for `heycity.stolbergco.com`:

```nginx
location = /support { alias /var/www/heycity-support/index.html; default_type text/html; }
location = /support/ { return 308 /support; }
```

Inspect the effective config before applying, particularly TLS and an existing exact location. Back up the original virtual host and any existing Support file. Run `nginx -t`, then reload Nginx. If the host uses a different front end, implement the equivalent exact-path static handler there. Do not edit the API vhost, restart Compose services or recreate certificates. Check /support over HTTPS for the Support title and contact email, / for the same pre-change WebApp, and public API /health for the same healthy result. On failure restore the site config and previous file, or remove the newly installed file if none existed, then validate and reload. The static file persists across web container replacement.

## First use

1. Confirm the existing Hey City App Store Connect app (SKU `HEYCITY-IOS-001`, bundle `com.sunshine.aiguide`, language English US) and record its numeric Apple ID. Keep the existing Expo project `554718b7-7f37-4cbb-89d0-cec6fe193fb5`.
2. Preconfigure App Store distribution signing and an App Store Connect API key in the existing EAS project using an authorized account. Reuse valid credentials. Seed EAS remote build numbering above any already uploaded iOS number if needed. Set the dedicated GitHub environment `ios-testflight` with main-only policy, approved source SHA, numeric `ASC_APP_ID` and the existing scoped Expo robot token as `EXPO_TOKEN`. Use separate review of the workflow activation on main.
3. From main, run **Hey City internal TestFlight** with the CI-passing SHA already serving staging. Record workflow revision, requested SHA, EAS build ID, app version and build number. The workflow verifies EAS metadata before submitting that exact build ID; on timeout, check EAS and Apple before retrying.
4. Wait for Apple processing, complete any Apple compliance prompts based on the shipping app, verify the same build number and assign the owner's internal tester group only. Record processing and install status separately. Preserve the existing France exclusion. No exterior groups, public links or App Store release steps are part of this procedure.
