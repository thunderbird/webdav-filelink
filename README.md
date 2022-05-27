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