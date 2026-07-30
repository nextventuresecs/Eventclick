import { useState } from "react";
import { MessageSquare, Star, Send, CheckCircle2, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { feedbackApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CATEGORIES = [
  { id: "feature", label: "✨ Feature Request" },
  { id: "ui", label: "🎨 UI / Design" },
  { id: "performance", label: "⚡ Speed & Performance" },
  { id: "general", label: "💡 General Feedback" },
];

export const Feedback = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [category, setCategory] = useState("feature");
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [subject, setSubject] = useState("");
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await feedbackApi.submit({
        category,
        rating,
        subject,
        comments,
      });
      setSubmitted(true);
      toast("Thank you! Your feedback has been received.", "success");
    } catch (err: any) {
      toast(err.message || "Failed to submit feedback", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in">
      {/* Header Banner */}
      <div className="rounded-3xl bg-brand-gradient-tile p-6 md:p-8 text-white shadow-lg space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/15 backdrop-blur-md text-white border border-white/20">
          <MessageSquare className="w-3.5 h-3.5 text-purple-300" />
          Product Feedback
        </div>
        <h1 className="text-2xl md:text-3xl font-bold font-display text-white tracking-tight">
          Help Us Improve Eventclick
        </h1>
        <p className="text-sm text-white/80">
          Your insights guide our feature roadmap. Share your thoughts, feature requests, or design suggestions.
        </p>
      </div>

      {submitted ? (
        <Card className="card-static rounded-3xl border-emerald-200 bg-emerald-50/50 p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold font-display text-emerald-950">Feedback Submitted Successfully!</h2>
          <p className="text-xs text-emerald-800 max-w-md mx-auto">
            Thank you for helping us make Eventclick better for non-profits and event organizers around the world.
          </p>
          <Button
            onClick={() => {
              setSubmitted(false);
              setSubject("");
              setComments("");
            }}
            variant="outline"
            className="rounded-xl border-emerald-300 text-emerald-800 hover:bg-emerald-100"
          >
            Submit Another Feedback
          </Button>
        </Card>
      ) : (
        <Card className="card-static rounded-2xl">
          <CardContent className="p-6 md:p-8 space-y-6">
            <div>
              <CardTitle className="text-lg font-bold font-display text-gray-900">Feedback Form</CardTitle>
              <CardDescription className="text-xs">
                Submitting as <span className="font-semibold text-gray-700">{user?.fullName}</span> ({user?.email})
              </CardDescription>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Category Pills */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-gray-700">Feedback Category</Label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        category === cat.id
                          ? "bg-purple-600 text-white shadow-xs"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Star Rating */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-gray-700">Overall Experience Rating</Label>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="p-1 text-amber-400 transition-transform hover:scale-110 cursor-pointer"
                    >
                      <Star
                        className={`w-7 h-7 ${
                          (hoverRating || rating) >= star ? "fill-amber-400" : "fill-gray-100 text-gray-300"
                        }`}
                      />
                    </button>
                  ))}
                  <span className="text-xs font-semibold text-gray-500 ml-2">
                    {rating} of 5 Stars
                  </span>
                </div>
              </div>

              {/* Subject */}
              <div className="space-y-1.5">
                <Label htmlFor="subject" className="text-xs font-semibold text-gray-700">Subject Summary</Label>
                <Input
                  id="subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Add dark mode toggle or GPS map export option"
                  required
                  className="input-premium"
                />
              </div>

              {/* Comments */}
              <div className="space-y-1.5">
                <Label htmlFor="comments" className="text-xs font-semibold text-gray-700">Detailed Feedback & Suggestions</Label>
                <textarea
                  id="comments"
                  rows={5}
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Describe your suggestion or experience in detail..."
                  required
                  className="w-full rounded-xl border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white text-gray-900"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <Button type="submit" disabled={submitting} className="bg-brand-gradient h-11 px-6 rounded-xl font-semibold shadow-xs">
                  <Send className="w-4 h-4 mr-2" />
                  {submitting ? "Submitting..." : "Submit Feedback"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
