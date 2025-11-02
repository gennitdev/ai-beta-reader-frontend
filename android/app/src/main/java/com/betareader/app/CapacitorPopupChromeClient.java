package com.betareader.app;

import android.app.Dialog;
import android.content.DialogInterface;
import android.os.Message;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * Handles popup windows (window.open) within the Capacitor WebView so that
 * OAuth flows like Google Identity Services can show their consent screens.
 */
public class CapacitorPopupChromeClient extends BridgeWebChromeClient {
    private Dialog popupDialog;

    public CapacitorPopupChromeClient(Bridge bridge) {
        super(bridge);
    }

    @Override
    public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
        WebView popupWebView = new WebView(view.getContext());

        WebSettings popupSettings = popupWebView.getSettings();
        popupSettings.setJavaScriptEnabled(true);
        popupSettings.setDomStorageEnabled(true);
        popupSettings.setSupportMultipleWindows(true);
        popupSettings.setJavaScriptCanOpenWindowsAutomatically(true);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(popupWebView, true);

        popupWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                view.loadUrl(request.getUrl().toString());
                return true;
            }
        });

        popupWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onCloseWindow(WebView window) {
                if (popupDialog != null && popupDialog.isShowing()) {
                    popupDialog.dismiss();
                }
            }
        });

        popupDialog = new Dialog(view.getContext());
        popupDialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        popupDialog.setContentView(popupWebView);
        popupDialog.setOnDismissListener(new DialogInterface.OnDismissListener() {
            @Override
            public void onDismiss(DialogInterface dialog) {
                popupWebView.destroy();
            }
        });
        popupDialog.show();
        if (popupDialog.getWindow() != null) {
            popupDialog.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        }

        WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
        transport.setWebView(popupWebView);
        resultMsg.sendToTarget();

        return true;
    }

    @Override
    public void onCloseWindow(WebView window) {
        if (popupDialog != null && popupDialog.isShowing()) {
            popupDialog.dismiss();
        }
        super.onCloseWindow(window);
    }
}
