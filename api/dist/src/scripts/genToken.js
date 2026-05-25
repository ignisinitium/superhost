import speakeasy from 'speakeasy';
const secret = 'MJCUG23OGYRVKZT2IVJTGUSCOBXDKN2CINKDC2B2OJDSSZ2FFRSQ';
const token = speakeasy.totp({
    secret: secret,
    encoding: 'base32'
});
console.log(token);
//# sourceMappingURL=genToken.js.map