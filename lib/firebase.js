"use client";

import { getApps, initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { firebaseConfig } from "./firebase-config";

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const database = getDatabase(app);
