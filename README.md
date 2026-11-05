# FileLink Provider for WebDAV (Thunderbird add-on)
This add-on was originally created by Geoff Lankow, but is now maintained by the Thunderbird Team.

The provider allows to upload large attachments to a WebDAV account instead of sending them by email.

## Logo
The logo is provided by http://www.webdav.org/

## Requirements
You need a WebDAV account which is protected by basic authentication, or ip range (private url). The files should be readable by anonymous or authenticated users (depends on your requirements).

## How it works
* Install the add-on as described in the following [support article](https://support.mozilla.org/en-US/kb/installing-addon-thunderbird). You do not need to download the add-on beforehand, but can search for it using Thunderbird's add-on manager. If you do want to manually download the add-on file, you can find it [here](https://addons.thunderbird.net/addon/filelink-provider-for-webdav/) on addons.thunderbird.net.
* Add WebDAV as FileLink Storage Provider (Configuration > Composition -> Attachments)
* Configure private and public url (sometimes the same), username and password

## How to setup the required WebDAV server

### copyparty with filekeys

For [copyparty](https://github.com/9001/copyparty#filekeys), enable the `fk`
volume flag and give the upload account write access plus either read (`r`)
or upget (`G`) access. Give recipients get (`g`) access to allow downloads
without signing in, while requiring the filekey.

In the account settings, select **copyparty** under **Authentication**, or
**copyparty with --usernames** if the server uses `--usernames`. This sends
copyparty's documented `PW` header for the connection check, uploads, and
deletions, allowing cross-origin requests without changing the server's
[CORS protections](https://github.com/9001/copyparty#cors). The copyparty modes
reject redirects to avoid forwarding the password header; use the final server
URL as the private URL. Existing accounts default to standard Basic authentication.

The add-on automatically copies the `k` filekey from the upload response's
`Location` header into the download link.
If you configure a different public URL, it must point to the same files and
preserve the `k` query parameter. Deletion still uses the private URL and the
configured credentials; copyparty requires read (`r`) and delete (`d`) access
for this. An upload-only `wG` account can share its uploads but cannot delete
them through WebDAV without those permissions.

### Tests

Run `node --test tests/*.test.cjs` (Node.js 18 or newer). These tests
exercise the upload, abort, and delete listeners, account settings, and
authentication with mocked Thunderbird APIs and HTTP responses.

### Example of Apache WebDAV with Active Directory Authentication
```
LoadModule      dav_module           modules/mod_dav.so
LoadModule      dav_fs_module        modules/mod_dav_fs.so
LoadModule      ldap_module          modules/mod_ldap.so
LoadModule      authnz_ldap_module   modules/mod_authnz_ldap.so

DocumentRoot "/srv/webdav"
DavLockDB "/var/lock/apache/DavLock.db"

# rewriting Destination because we're behind an SSL terminating reverse proxy
RequestHeader edit Destination ^https: http: early
<Directory "/srv/webdav">
    DAV on
    Options -Indexes
    AllowOverride None
    AuthName "WebDAV: Login with username and password"
    AuthBasicProvider ldap
    AuthType Basic
    AuthLDAPGroupAttribute member
    AuthLDAPGroupAttributeIsDN on
    AuthLDAPUrl "ldap://dc1.example.com/dc=example,dc=com?sAMAccountName?sub?(objectclass=*)"
    AuthLDAPBindDN "cn=filelink,ou=Users,ou=Example,dc=example,dc=com"
    AuthLDAPBindPassword "secret_pass"

    <Limit GET POST OPTIONS>
        Require all granted
    </Limit>
    <LimitExcept GET POST OPTIONS>
        Require ldap-group cn=Mail,ou=Groups,ou=Example,dc=example,dc=com
    </LimitExcept>
</Directory>
```
