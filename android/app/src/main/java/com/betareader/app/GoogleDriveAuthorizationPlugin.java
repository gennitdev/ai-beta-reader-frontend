package com.betareader.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationClient;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.ClearTokenRequest;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;
import java.util.Collections;
import java.util.List;

@CapacitorPlugin(name = "GoogleDriveAuthorization")
public class GoogleDriveAuthorizationPlugin extends Plugin {
    private static final String DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
    private static final long DEFAULT_TOKEN_LIFETIME_SECONDS = 3600L;

    private AuthorizationClient authorizationClient;
    private ActivityResultLauncher<IntentSenderRequest> authorizationLauncher;
    private PluginCall pendingAuthorizationCall;
    private boolean authorizationInProgress;

    @Override
    public void load() {
        authorizationClient = Identity.getAuthorizationClient(getActivity());
        authorizationLauncher = getActivity().registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(),
            this::handleAuthorizationActivityResult
        );
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        if (authorizationInProgress) {
            call.reject("Google Drive authorization is already in progress.", "AUTH_IN_PROGRESS");
            return;
        }
        authorizationInProgress = true;

        AuthorizationRequest request = AuthorizationRequest.builder()
            .setRequestedScopes(Collections.singletonList(new Scope(DRIVE_FILE_SCOPE)))
            .setOptOutIncludingGrantedScopes(true)
            .build();

        authorizationClient.authorize(request)
            .addOnSuccessListener(result -> handleAuthorizationResult(call, result))
            .addOnFailureListener(error -> rejectAuthorization(call, error));
    }

    @PluginMethod
    public void clearToken(PluginCall call) {
        String accessToken = call.getString("accessToken");
        if (accessToken == null || accessToken.isBlank()) {
            call.reject("An access token is required.", "TOKEN_REQUIRED");
            return;
        }

        ClearTokenRequest request = ClearTokenRequest.builder().setToken(accessToken).build();
        authorizationClient.clearToken(request)
            .addOnSuccessListener(unused -> call.resolve())
            .addOnFailureListener(error -> call.reject(
                "Could not clear the expired Google Drive token.",
                "TOKEN_CLEAR_FAILED",
                error instanceof Exception ? (Exception) error : null
            ));
    }

    private void handleAuthorizationResult(PluginCall call, AuthorizationResult result) {
        if (result.hasResolution()) {
            pendingAuthorizationCall = call;
            try {
                IntentSenderRequest request = new IntentSenderRequest.Builder(
                    result.getPendingIntent().getIntentSender()
                ).build();
                authorizationLauncher.launch(request);
            } catch (RuntimeException error) {
                pendingAuthorizationCall = null;
                authorizationInProgress = false;
                call.reject(
                    "Google Drive authorization could not be opened. You can try again.",
                    "AUTH_LAUNCH_FAILED",
                    error
                );
            }
            return;
        }

        resolveAuthorization(call, result);
    }

    private void handleAuthorizationActivityResult(ActivityResult activityResult) {
        PluginCall call = pendingAuthorizationCall;
        pendingAuthorizationCall = null;
        if (call == null) {
            authorizationInProgress = false;
            return;
        }
        if (activityResult.getResultCode() != Activity.RESULT_OK) {
            authorizationInProgress = false;
            call.reject(
                "Google Drive authorization was cancelled or denied. You can try again.",
                "AUTH_CANCELLED"
            );
            return;
        }

        Intent data = activityResult.getData();
        if (data == null) {
            authorizationInProgress = false;
            call.reject(
                "Google Drive authorization did not return a result. You can try again.",
                "AUTH_EMPTY_RESULT"
            );
            return;
        }

        try {
            resolveAuthorization(call, authorizationClient.getAuthorizationResultFromIntent(data));
        } catch (ApiException error) {
            rejectAuthorization(call, error);
        }
    }

    private void resolveAuthorization(PluginCall call, AuthorizationResult result) {
        authorizationInProgress = false;
        String accessToken = result.getAccessToken();
        List<String> grantedScopes = result.getGrantedScopes();
        if (accessToken == null || accessToken.isBlank()) {
            call.reject("Google Drive authorization did not return an access token.", "AUTH_NO_TOKEN");
            return;
        }
        if (grantedScopes == null
            || grantedScopes.size() != 1
            || !DRIVE_FILE_SCOPE.equals(grantedScopes.get(0))) {
            call.reject("Google Drive authorization returned an unexpected scope grant.", "AUTH_SCOPE_MISMATCH");
            return;
        }

        JSObject response = new JSObject();
        response.put("accessToken", accessToken);
        response.put("expiresIn", readExpiresInSeconds(result.getTokenResponseParams()));
        response.put("grantedScopes", new JSArray(grantedScopes));
        call.resolve(response);
    }

    private long readExpiresInSeconds(Bundle tokenResponseParams) {
        if (tokenResponseParams == null) {
            return DEFAULT_TOKEN_LIFETIME_SECONDS;
        }
        long seconds = tokenResponseParams.getLong("expires_in", 0L);
        if (seconds > 0) {
            return seconds;
        }
        String value = tokenResponseParams.getString("expires_in");
        if (value != null) {
            try {
                seconds = Long.parseLong(value);
                return seconds > 0 ? seconds : DEFAULT_TOKEN_LIFETIME_SECONDS;
            } catch (NumberFormatException ignored) {
                // Fall through to the standard Google access-token lifetime.
            }
        }
        return DEFAULT_TOKEN_LIFETIME_SECONDS;
    }

    private void rejectAuthorization(PluginCall call, Exception error) {
        authorizationInProgress = false;
        call.reject(
            "Google Drive authorization was denied or could not be completed. You can try again.",
            "AUTH_DENIED",
            error
        );
    }
}
