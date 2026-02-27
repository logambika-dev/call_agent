import passport from "passport";
import { Strategy } from "passport-custom";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import cognitoConfig from "../config/cognito.js";

// Validate Cognito configuration
if (!cognitoConfig.userPoolId || !cognitoConfig.clientId || !cognitoConfig.region) {
  console.warn('Cognito configuration missing. Skipping JWT verifier setup.');
}

let verifier = null;
if (cognitoConfig.userPoolId && cognitoConfig.clientId && cognitoConfig.region) {
  try {
    verifier = CognitoJwtVerifier.create({
      userPoolId: cognitoConfig.userPoolId,
      tokenUse: "access",
      clientId: cognitoConfig.clientId,
      region: cognitoConfig.region,
    });
  } catch (error) {
    console.error('Failed to create Cognito JWT verifier:', error.message);
  }
}

export const userAuthMiddleware = (passport) => {
  passport.use(
    "userAuthentication",
    new Strategy(async function (req, done) {
      try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return done(null, false);
        }
        
        const token = authHeader.substring(7);
        
        if (!verifier) {
          return done(null, false, { message: "Cognito verifier not configured" });
        }
        
        const verifiedPayload = await verifier.verify(token);
        
        const user = {
          id: verifiedPayload.sub,
          accessToken: token,
        };
        
        done(null, user);
      } catch (error) {
        console.error("Cognito token verification error:", error.message);
        done(null, false, { message: "Invalid or expired token" });
      }
    })
  );
  

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });
  
  passport.deserializeUser((id, done) => {
    done(null, { id }); 
  });
};

export const userAuthenticate = (req, res, next) =>
  passport.authenticate(
    "userAuthentication",
    { session: false },
    (err, user, info) => {
      if (err) {
        console.error("Auth error:", err);
        return res.status(500).json({ success: false, message: "Internal server error" });
      }
      if (!user) {
        const message = info && info.message ? info.message : "Unauthorized: Invalid token";
        return res.status(401).json({ success: false, message: message });
      }
      
      req.user = user;
      return next();
    }
  )(req, res, next);