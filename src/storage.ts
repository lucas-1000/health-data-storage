import { Storage } from '@google-cloud/storage';

export class PhotoStorage {
  private storage: Storage;
  private bucketName: string;

  constructor(bucketName: string) {
    this.storage = new Storage();
    this.bucketName = bucketName;
  }

  /**
   * Upload a photo and return its public URL
   */
  async uploadPhoto(
    userId: string,
    imageBase64: string,
    mealId: number
  ): Promise<string> {
    const bucket = this.storage.bucket(this.bucketName);

    // Create a unique filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${userId}/${timestamp}-${mealId}.jpg`;

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(imageBase64, 'base64');

    // Upload to Cloud Storage
    const file = bucket.file(filename);
    await file.save(imageBuffer, {
      metadata: {
        contentType: 'image/jpeg',
        metadata: {
          userId,
          mealId: mealId.toString(),
          uploadedAt: new Date().toISOString(),
        },
      },
      public: false, // Keep photos private
    });

    // Return Cloud Storage URL
    return `gs://${this.bucketName}/${filename}`;
  }

  /**
   * Get a signed URL for viewing a photo (expires in 1 hour)
   */
  async getSignedUrl(photoUrl: string): Promise<string> {
    // Extract bucket and filename from gs:// URL
    const match = photoUrl.match(/^gs:\/\/([^\/]+)\/(.+)$/);
    if (!match) {
      throw new Error('Invalid photo URL format');
    }

    const [, bucketName, filename] = match;
    const bucket = this.storage.bucket(bucketName);
    const file = bucket.file(filename);

    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 3600 * 1000, // 1 hour
    });

    return signedUrl;
  }

  /**
   * Delete a photo
   */
  async deletePhoto(photoUrl: string): Promise<void> {
    const match = photoUrl.match(/^gs:\/\/([^\/]+)\/(.+)$/);
    if (!match) {
      throw new Error('Invalid photo URL format');
    }

    const [, bucketName, filename] = match;
    const bucket = this.storage.bucket(bucketName);
    await bucket.file(filename).delete();
  }
}
