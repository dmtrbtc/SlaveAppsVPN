// Copyright 2015 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license.

package go;

import android.content.Context;

/**
 * Host-side gomobile loader required by the go.Seq ABI bundled in clashbox.aar.
 *
 * The class name and public {@code ctx} field are read reflectively by go.Seq.
 * Loading it first guarantees that libgojni is present before Seq.init().
 */
public final class LoadJNI {
    public static Object ctx;

    static {
        System.loadLibrary("gojni");
    }

    private LoadJNI() {}

    public static void setContext(Context context) {
        ctx = context == null ? null : context.getApplicationContext();
    }
}
