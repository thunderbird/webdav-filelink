# FileLink provider for WebDAV

## Requirements
You need a WebDAV account which is protected by ip range (private url) or authentication. The files should be readable by anonymous or authenticated users (depends on your requirements).

## How it works
* Download & Install the plugin
* Add WebDAV as FileLink Storage Provider (Configuration > Composition -> Attachments)
* Configure private and public url (sometimes the same)

## Example of Apache WebDAV with Active Directory Authentication
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
