package org.sc26.fieldguide;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLConnection;
import java.util.Collections;
import java.util.Locale;

/** A local HTTPS origin keeps the complete guide available without a connection. */
public final class GuideActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private WebView view;
    private CalendarExport calendar;

    @Override
    public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        calendar = new CalendarExport(this, savedState);
        view = new WebView(this);
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        view.setWebViewClient(new LocalGuideClient());
        setContentView(view);
        view.loadUrl("https://" + HOST + "/index.html");
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        calendar.remember(state);
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        calendar.finish(request, result, data);
    }

    @Override
    public void onBackPressed() {
        view.evaluateJavascript("Boolean(window.Guide && window.Guide.back && window.Guide.back())",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String consumed) {
                        if (!"true".equals(consumed)) {
                            if (view.canGoBack()) view.goBack();
                            else finish();
                        }
                    }
                });
    }

    private static boolean isLocal(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost());
    }

    private static String mime(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".json")) return "application/json";
        String result = URLConnection.guessContentTypeFromName(path);
        return result == null ? "application/octet-stream" : result;
    }

    private final class LocalGuideClient extends WebViewClient {
        @Override
        public void onPageFinished(WebView web, String url) {
            Uri uri = Uri.parse(url);
            if (isLocal(uri) && "/index.html".equals(uri.getPath())) {
                calendar.connect(web, Uri.parse("https://" + HOST));
            }
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView web, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (isLocal(uri)) {
                String path = uri.getPath();
                if ("/".equals(path)) path = "/index.html";
                if (path != null && path.startsWith("/") && !path.contains("..") && !path.contains("\\")) {
                    try {
                        InputStream in = getAssets().open("www" + path);
                        String type = mime(path);
                        String encoding = type.startsWith("text/") || type.contains("javascript")
                                || type.contains("json") || type.contains("svg") ? "UTF-8" : null;
                        return new WebResourceResponse(type, encoding, 200, "OK",
                                Collections.singletonMap("Content-Security-Policy",
                                        "frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'"),
                                in);
                    } catch (IOException missing) {
                        // The response below gives the page an ordinary missing-asset error.
                    }
                }
            }
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                    Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView web, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (isLocal(uri)) return false;
            if (request.isForMainFrame() && "https".equals(uri.getScheme())) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException unavailable) {
                    Toast.makeText(GuideActivity.this, "No browser is available to open this link.",
                            Toast.LENGTH_LONG).show();
                }
            }
            return true;
        }
    }
}
