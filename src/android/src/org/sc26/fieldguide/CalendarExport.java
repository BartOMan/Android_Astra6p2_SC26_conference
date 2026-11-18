package org.sc26.fieldguide;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import android.webkit.WebView;
import android.widget.Toast;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Only the top-level local page gets this port. No Java interface is exposed to frames. */
final class CalendarExport {
    private static final int CREATE_CALENDAR = 2601;
    private static final String CACHE_KEY = "pendingCalendarFile";
    private final Activity activity;
    private WebMessagePort requestPort;
    private File pendingFile;

    CalendarExport(Activity activity, Bundle state) {
        this.activity = activity;
        String name = state == null ? null : state.getString(CACHE_KEY);
        if (name != null && name.matches("sc26-[0-9]+\\.ics")) {
            pendingFile = new File(activity.getCacheDir(), name);
        }
    }

    void connect(WebView view, Uri origin) {
        if (requestPort != null) requestPort.close();
        WebMessagePort[] ports = view.createWebMessageChannel();
        requestPort = ports[0];
        requestPort.setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
            @Override
            public void onMessage(WebMessagePort port, WebMessage message) {
                chooseDestination(message.getData());
            }
        });
        String receivePort = "(function(){function accept(e){"
                + "if(e.data!=='sc26-calendar-port'||!e.ports||e.ports.length!==1)return;"
                + "window.removeEventListener('message',accept);var p=e.ports[0];"
                + "window.GuideExport={writeCalendar:function(text){p.postMessage(String(text));}};}"
                + "window.addEventListener('message',accept);})();";
        view.evaluateJavascript(receivePort, new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String ignored) {
                view.postWebMessage(new WebMessage("sc26-calendar-port",
                        new WebMessagePort[]{ports[1]}), origin);
            }
        });
    }

    private void chooseDestination(String text) {
        if (pendingFile != null) {
            notice("A calendar export is already open.");
            return;
        }
        if (text == null || !text.startsWith("BEGIN:VCALENDAR")
                || !text.trim().endsWith("END:VCALENDAR")) {
            notice("Could not export the calendar. The calendar data is incomplete.");
            return;
        }
        try {
            pendingFile = File.createTempFile("sc26-", ".ics", activity.getCacheDir());
            try (FileOutputStream file = new FileOutputStream(pendingFile)) {
                file.write(text.getBytes(StandardCharsets.UTF_8));
            }
            Intent chooser = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            chooser.addCategory(Intent.CATEGORY_OPENABLE);
            chooser.setType("text/calendar");
            chooser.putExtra(Intent.EXTRA_TITLE, "SC26-itinerary.ics");
            activity.startActivityForResult(chooser, CREATE_CALENDAR);
        } catch (IOException | ActivityNotFoundException problem) {
            discard();
            notice("Could not open the calendar export.");
        }
    }

    void remember(Bundle state) {
        if (pendingFile != null) state.putString(CACHE_KEY, pendingFile.getName());
    }

    void finish(int request, int result, Intent data) {
        if (request != CREATE_CALENDAR) return;
        if (result != Activity.RESULT_OK) {
            discard();
            notice("Calendar export canceled.");
            return;
        }
        Uri uri = data == null ? null : data.getData();
        if (uri == null || pendingFile == null) {
            discard();
            notice("Could not save the calendar.");
            return;
        }
        try (FileInputStream input = new FileInputStream(pendingFile);
             OutputStream output = activity.getContentResolver().openOutputStream(uri, "wt")) {
            if (output == null) throw new IOException("No output stream.");
            byte[] buffer = new byte[32 * 1024];
            int length;
            while ((length = input.read(buffer)) != -1) output.write(buffer, 0, length);
        } catch (IOException | SecurityException problem) {
            notice("Could not save the calendar.");
            return;
        } finally {
            discard();
        }
        notice("Calendar saved.");
    }

    private void discard() {
        if (pendingFile != null) pendingFile.delete();
        pendingFile = null;
    }

    private void notice(String message) {
        Toast.makeText(activity, message, Toast.LENGTH_LONG).show();
    }
}
